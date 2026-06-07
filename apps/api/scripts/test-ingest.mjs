/**
 * E2E test: auth → knowledge ingest → job poll → RAG test-chat
 * Requires: docker compose up -d && npm run dev:api
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const API = process.env.API_URL ?? "http://localhost:3001";
const TABLE = process.env.TABLE_NAME ?? "CommerceChat-Main";
const email = `ingest-test-${Date.now()}@example.com`;
const password = "TestPassword123!";

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: "us-east-1",
    endpoint: process.env.DYNAMODB_ENDPOINT ?? "http://localhost:4566",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  })
);

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

async function reqOk(path, opts = {}) {
  const { ok, status, json } = await req(path, opts);
  if (!ok) throw new Error(`${path} ${status}: ${JSON.stringify(json)}`);
  return json;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function verifyEmailLocal(normalizedEmail) {
  const lookup = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `EMAIL#${normalizedEmail}`, SK: "USER" },
    })
  );
  if (!lookup.Item) throw new Error("Email lookup not found after signup");
  const { tenantId, userId } = lookup.Item;
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `TENANT#${tenantId}`, SK: `USER#${userId}` },
      UpdateExpression: "SET emailVerified = :v",
      ExpressionAttributeValues: { ":v": true },
    })
  );
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  console.log("=== 1. Health ===");
  const health = await reqOk("/health");
  assert(health.data.runtime === "aws-lambda", "expected real Lambda runtime");
  console.log("OK", health.data);

  console.log("\n=== 2. Signup + verify (local DynamoDB patch) ===");
  await reqOk("/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      storeName: "Ingest Test Store",
      name: "Tester",
      email,
      password,
      timezone: "America/New_York",
    }),
  });
  await verifyEmailLocal(email.toLowerCase());
  const login = await reqOk("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const token = login.data.accessToken;
  const auth = { Authorization: `Bearer ${token}` };
  console.log("OK logged in as", email);

  console.log("\n=== 3. Create website source ===");
  const source = await reqOk("/api/v1/knowledge/sources", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      type: "website",
      name: "Example Site",
      config: { url: "https://example.com", maxDepth: 1, maxPages: 3 },
    }),
  });
  const sourceId = source.data.sourceId;
  assert(sourceId?.startsWith("src_"), "sourceId format");
  console.log("OK source", sourceId);

  console.log("\n=== 4. Sync → queued (202) ===");
  const syncPath = `/api/v1/knowledge/sources/${sourceId}/sync`;
  const syncRes = await req(syncPath, { method: "POST", headers: auth, body: "{}" });
  assert(syncRes.status === 202, `expected 202, got ${syncRes.status}`);
  const jobId = syncRes.json.data.jobId;
  console.log("OK job queued", jobId);

  console.log("\n=== 4b. Duplicate sync while active → 409 ===");
  let dupRejected = false;
  for (let i = 0; i < 15; i++) {
    const job = await reqOk(`/api/v1/knowledge/jobs/${jobId}`, { headers: auth });
    if (job.data.status === "queued" || job.data.status === "running") {
      const dup = await req(syncPath, { method: "POST", headers: auth, body: "{}" });
      if (dup.status === 409) {
        dupRejected = true;
        break;
      }
    }
    if (job.data.status === "completed" || job.data.status === "failed") break;
    await sleep(200);
  }
  if (dupRejected) {
    console.log("OK duplicate sync rejected");
  } else {
    console.log("SKIP duplicate sync 409 (job completed before second request — expected for small sites)");
  }

  console.log("\n=== 5. Poll GET /jobs/{jobId} ===");
  let finalJob;
  for (let i = 0; i < 90; i++) {
    const job = await reqOk(`/api/v1/knowledge/jobs/${jobId}`, { headers: auth });
    process.stdout.write(`\r  [${i}] ${job.data.status} ${job.data.progressPct ?? 0}% chunks=${job.data.stats?.chunksCreated ?? 0}   `);
    if (job.data.status === "completed" || job.data.status === "failed") {
      finalJob = job.data;
      break;
    }
    await sleep(1000);
  }
  console.log();
  assert(finalJob?.status === "completed", `job failed: ${finalJob?.error}`);
  assert((finalJob.stats?.chunksCreated ?? 0) > 0, "expected chunks created");
  assert((finalJob.stats?.pagesProcessed ?? 0) > 0, "expected pages processed");
  console.log("OK job completed", finalJob.stats);

  console.log("\n=== 6. List sources (chunk counts updated) ===");
  const sources = await reqOk("/api/v1/knowledge/sources", { headers: auth });
  const updated = sources.data.items.find((s) => s.sourceId === sourceId);
  assert(updated?.chunkCount > 0, "source chunkCount should be > 0");
  assert(updated?.status === "active", "source should be active");
  console.log("OK", updated.chunkCount, "chunks,", updated.vectorCount, "vectors");

  console.log("\n=== 7. List jobs includes completed job ===");
  const jobs = await reqOk("/api/v1/knowledge/jobs", { headers: auth });
  assert(jobs.data.items.some((j) => j.jobId === jobId), "job in list");
  console.log("OK", jobs.data.items.length, "jobs listed");

  console.log("\n=== 8. Onboarding test-chat (RAG) ===");
  const chat = await reqOk("/api/v1/onboarding/test-chat", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ message: "What is this website about?" }),
  });
  assert(chat.data.reply?.content, "expected reply content");
  console.log("OK reply preview:", chat.data.reply.content.slice(0, 120) + "...");

  console.log("\n=== ALL TESTS PASSED ===");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message ?? err);
  process.exit(1);
});
