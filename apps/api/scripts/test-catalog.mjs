/**
 * E2E test: catalog CSV upload → sync → vectors + product cache
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const API = process.env.API_URL ?? "http://localhost:3001";
const TABLE = process.env.TABLE_NAME ?? "CommerceChat-Main";
const email = `catalog-test-${Date.now()}@example.com`;
const password = "TestPassword123!";
const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleCsv = readFileSync(
  join(__dirname, "../../admin/public/sample-products.csv"),
  "utf8"
);

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: "us-east-1",
    endpoint: process.env.DYNAMODB_ENDPOINT ?? "http://localhost:4566",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  })
);

async function reqOk(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
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
  return tenantId;
}

function buildMultipart(fields, file) {
  const boundary = "----CatalogTestBoundary";
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    );
  }
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="products.csv"\r\nContent-Type: text/csv\r\n\r\n${file}\r\n`
  );
  parts.push(`--${boundary}--\r\n`);
  return { body: parts.join(""), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function main() {
  await reqOk("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storeName: "Catalog Test Store",
      name: "Tester",
      email,
      password,
      timezone: "America/New_York",
    }),
  });
  const tenantId = await verifyEmailLocal(email.toLowerCase());

  const login = await reqOk("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const token = login.data.accessToken;
  const auth = { Authorization: `Bearer ${token}` };

  const mp = buildMultipart({ type: "catalog", name: "Product catalog" }, sampleCsv);
  const source = await reqOk("/api/v1/knowledge/sources", {
    method: "POST",
    headers: { ...auth, "Content-Type": mp.contentType },
    body: mp.body,
  });

  if (source.data.type !== "catalog") throw new Error("expected catalog source");
  const sourceId = source.data.sourceId;
  console.log("OK source", sourceId);

  const sync = await reqOk(`/api/v1/knowledge/sources/${sourceId}/sync`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: "{}",
  });
  const jobId = sync.data.jobId;

  let finalJob;
  for (let i = 0; i < 60; i++) {
    const job = await reqOk(`/api/v1/knowledge/jobs/${jobId}`, { headers: auth });
    if (job.data.status === "completed" || job.data.status === "failed") {
      finalJob = job.data;
      break;
    }
    await sleep(1000);
  }
  if (finalJob?.status !== "completed") throw new Error(finalJob?.error ?? "job failed");
  if (finalJob.stats.chunksCreated !== 3) {
    throw new Error(`expected 3 chunks, got ${finalJob.stats.chunksCreated}`);
  }
  console.log("OK job", finalJob.stats);

  const products = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `TENANT#${tenantId}`,
        ":sk": "PRODUCT#",
      },
    })
  );
  if ((products.Items ?? []).length !== 3) {
    throw new Error(`expected 3 products in cache, got ${products.Items?.length}`);
  }
  console.log("OK product cache", products.Items.map((p) => p.sku).join(", "));

  const chat = await reqOk("/api/v1/onboarding/test-chat", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Do you have blue sneakers?" }),
  });
  if (!chat.data.reply?.content?.toLowerCase().includes("blue")) {
    throw new Error("RAG reply did not mention blue product");
  }
  console.log("OK RAG:", chat.data.reply.content.slice(0, 100) + "...");

  console.log("ALL CATALOG TESTS PASSED");
}

main().catch((e) => {
  console.error("FAILED:", e.message ?? e);
  process.exit(1);
});
