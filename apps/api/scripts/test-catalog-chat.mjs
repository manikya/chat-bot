/**
 * E2E: catalog ingest → onboarding test-chat with product questions
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const API = process.env.API_URL ?? "http://localhost:3001";
const TABLE = process.env.TABLE_NAME ?? "CommerceChat-Main";
const email = `chat-test-${Date.now()}@example.com`;
const password = "TestPassword123!";
const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleCsv = readFileSync(join(__dirname, "../../admin/public/sample-products.csv"), "utf8");

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: "us-east-1",
    endpoint: process.env.DYNAMODB_ENDPOINT ?? "http://localhost:4566",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  })
);

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
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

function buildMultipart(fields, file) {
  const boundary = "----ChatTestBoundary";
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  }
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="products.csv"\r\nContent-Type: text/csv\r\n\r\n${file}\r\n`
  );
  parts.push(`--${boundary}--\r\n`);
  return { body: parts.join(""), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function pollJob(jobId, auth) {
  for (let i = 0; i < 60; i++) {
    const job = await reqOk(`/api/v1/knowledge/jobs/${jobId}`, { headers: auth });
    if (job.data.status === "completed") return job.data;
    if (job.data.status === "failed") throw new Error(job.data.error);
    await sleep(1000);
  }
  throw new Error("job timeout");
}

async function testChat(message, auth) {
  const res = await reqOk("/api/v1/onboarding/test-chat", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return res.data;
}

function assertIncludes(text, needle, label) {
  if (!text.toLowerCase().includes(needle.toLowerCase())) {
    throw new Error(`${label}: expected reply to include "${needle}", got: ${text.slice(0, 200)}`);
  }
}

async function main() {
  console.log("=== Setup: signup + catalog ingest ===");
  await reqOk("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storeName: "Chat Test Store",
      name: "Tester",
      email,
      password,
      timezone: "America/New_York",
    }),
  });
  await verifyEmailLocal(email.toLowerCase());

  const login = await reqOk("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const auth = { Authorization: `Bearer ${login.data.accessToken}` };
  console.log("Logged in:", email);

  const mp = buildMultipart({ type: "catalog", name: "Product catalog" }, sampleCsv);
  const source = await reqOk("/api/v1/knowledge/sources", {
    method: "POST",
    headers: { ...auth, "Content-Type": mp.contentType },
    body: mp.body,
  });
  const sync = await reqOk(`/api/v1/knowledge/sources/${source.data.sourceId}/sync`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: "{}",
  });
  await pollJob(sync.data.jobId, auth);
  console.log("OK catalog indexed\n");

  const questions = [
    { q: "Do you have blue sneakers?", expect: "blue runner" },
    { q: "How much are the leather boots?", expect: "129.99" },
    { q: "What sizes does the cotton tee come in?", expect: "tee" },
  ];

  console.log("=== Onboarding test-chat ===");
  for (const { q, expect } of questions) {
    const data = await testChat(q, auth);
    const reply = data.reply.content;
    console.log(`\nQ: ${q}`);
    console.log(`A: ${reply.slice(0, 220)}${reply.length > 220 ? "..." : ""}`);
    assertIncludes(reply, expect, q);
    assertIncludes(reply, "Based on your site", q);
    console.log(`✓ matched "${expect}"`);
  }

  const last = await testChat("Thanks!", auth);
  if (last.testMessageCount < 4) throw new Error("expected testMessageCount >= 4");
  if (!last.canAdvanceToWidget) throw new Error("canAdvanceToWidget should be true");
  console.log("\nOK testMessageCount:", last.testMessageCount);

  console.log("\n=== ALL CHAT TESTS PASSED ===");
  console.log("UI: login at /login with", email, "/", password);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message ?? e);
  process.exit(1);
});
