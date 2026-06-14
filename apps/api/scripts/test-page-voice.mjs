/**
 * E2E: Page voice — status, upload, sync, pause, echo webhook, RAG
 * Requires: docker compose up -d && npm run dev:api
 */
import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const API = process.env.API_URL ?? "http://localhost:3001";
const IS_LOCAL = API.includes("localhost") || API.includes("127.0.0.1");

function loadEnvFile() {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "../.env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();

function loadAwsCreds() {
  if (IS_LOCAL) return null;
  const csvPath =
    process.env.AWS_CREDENTIALS_CSV ?? "/Users/manikya/Downloads/manikya_accessKeys (1).csv";
  if (!existsSync(csvPath)) return null;
  const text = readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "").trim();
  const [headerLine, valueLine] = text.split(/\r?\n/);
  if (!headerLine || !valueLine) return null;
  const headers = headerLine.split(",").map((h) => h.trim());
  const values = valueLine.split(",").map((v) => v.trim());
  const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  const accessKeyId = row["Access key ID"] || row["AWSAccessKeyId"] || row["Access key"];
  const secretAccessKey = row["Secret access key"] || row["AWSSecretKey"] || row["Secret key"];
  if (!accessKeyId || !secretAccessKey) return null;
  return { accessKeyId, secretAccessKey };
}

const awsCreds = loadAwsCreds();
const TABLE = IS_LOCAL
  ? (process.env.TABLE_NAME ?? "CommerceChat-Main")
  : (process.env.AWS_TABLE_NAME ?? "commercechat-dev-storage-main");

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient(
    IS_LOCAL
      ? {
          region: "us-east-1",
          endpoint: process.env.DYNAMODB_ENDPOINT ?? "http://localhost:4566",
          credentials: { accessKeyId: "test", secretAccessKey: "test" },
        }
      : {
          region: process.env.AWS_REGION ?? "us-east-1",
          credentials: awsCreds ?? undefined,
        }
  )
);

const META_APP_SECRET = process.env.META_APP_SECRET ?? "your-meta-app-secret";
const META_APP_ID = process.env.META_APP_ID ?? "your-meta-app-id";
const email = `pagevoice-${Date.now()}@example.com`;
const password = "TestPassword123!";
const PAGE_ID = `page_${Date.now()}`;
const CUSTOMER_PSID = "cust_psid_12345";

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  const json = await res.json().catch(() => ({}));
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
  return tenantId;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function pollJob(jobId, auth) {
  for (let i = 0; i < 40; i++) {
    const job = await reqOk(`/api/v1/knowledge/jobs/${jobId}`, { headers: auth });
    const status = job.data.status;
    if (status === "completed" || status === "failed") return job.data;
    await sleep(500);
  }
  throw new Error("Job poll timeout");
}

function metaSignature(body) {
  const sig = createHmac("sha256", META_APP_SECRET).update(body).digest("hex");
  return `sha256=${sig}`;
}

async function postMetaWebhook(payload) {
  const body = JSON.stringify(payload);
  const res = await fetch(`${API}/webhooks/meta`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": metaSignature(body),
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function seedPageRouting(tenantId, pageId) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `PAGE#${pageId}`,
        SK: "TENANT",
        tenantId,
        pageId,
      },
    })
  );
}

function customerWebhookPayload(pageId, psid, text, mid) {
  return {
    object: "page",
    entry: [
      {
        id: pageId,
        messaging: [
          {
            sender: { id: psid },
            recipient: { id: pageId },
            timestamp: Date.now(),
            message: { mid, text },
          },
        ],
      },
    ],
  };
}

function ownerEchoPayload(pageId, psid, text, mid, appId) {
  return {
    object: "page",
    entry: [
      {
        id: pageId,
        messaging: [
          {
            sender: { id: pageId },
            recipient: { id: psid },
            timestamp: Date.now(),
            message: {
              mid,
              text,
              is_echo: true,
              ...(appId ? { app_id: appId } : {}),
            },
          },
        ],
      },
    ],
  };
}

async function main() {
  console.log("=== 1. Health ===");
  const health = await reqOk("/health");
  console.log("OK", health.data.runtime, "skipEmailVerification:", health.data.skipEmailVerification);

  console.log("\n=== 2. Signup + login ===");
  let auth;
  let tenantId = "";
  const useExisting = Boolean(process.env.TEST_EMAIL && process.env.TEST_PASSWORD);

  if (useExisting) {
    const login = await reqOk("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.TEST_EMAIL,
        password: process.env.TEST_PASSWORD,
      }),
    });
    auth = { Authorization: `Bearer ${login.data.accessToken}` };
    console.log("logged in as", process.env.TEST_EMAIL);
  } else {
    await reqOk("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeName: "Page Voice Test",
        name: "Tester",
        email,
        password,
        timezone: "Asia/Colombo",
      }),
    });
    if (IS_LOCAL) {
      tenantId = await verifyEmailLocal(email.toLowerCase());
    }
    const login = await reqOk("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    auth = { Authorization: `Bearer ${login.data.accessToken}` };
    console.log("tenant", tenantId || login.data.tenant?.tenantId || "aws");
    if (IS_LOCAL && tenantId) await seedPageRouting(tenantId, PAGE_ID);
  }

  console.log("\n=== 3. Page voice status ===");
  const empty = await reqOk("/api/v1/knowledge/page-voice", { headers: auth });
  if (!useExisting) {
    assert(empty.data.pairCount === 0, "expected 0 pairs");
    assert(empty.data.learningPaused === false, "learning should be active");
  }
  console.log("OK", empty.data);

  const pairsBefore = empty.data.pairCount ?? 0;

  console.log("\n=== 4. Upload conversation CSV ===");
  const csv = [
    "customer,owner",
    "Do you deliver to Colombo?,Yes we deliver island-wide within 2-3 days.",
    "What are your hours?,We're open Mon-Sat 9am-6pm.",
    "Can I pay on delivery?,Yes COD is available for orders under 25000 LKR.",
  ].join("\n");
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "history.csv");
  const upload = await reqOk("/api/v1/knowledge/page-voice/upload", {
    method: "POST",
    headers: auth,
    body: form,
  });
  assert(upload.data.added === 3, `expected 3 pairs, got ${upload.data.added}`);
  console.log("upload OK", upload.data);

  if (upload.data.jobId) {
    console.log("\n=== 5. Poll ingest job ===");
    const job = await pollJob(upload.data.jobId, auth);
    assert(job.status === "completed", `job failed: ${job.error}`);
    console.log("job OK", job.stats);
  } else if (upload.data.status === "completed") {
    console.log("\n=== 5. Ingest completed inline ===");
    console.log("OK", upload.data);
  }

  console.log("\n=== 6. Status with preview ===");
  const status = await reqOk("/api/v1/knowledge/page-voice", { headers: auth });
  assert(status.data.pairCount === pairsBefore + 3, `pairCount should be ${pairsBefore + 3}`);
  assert(status.data.preview.length > 0, "preview should have items");
  assert(status.data.vectorCount > 0, "vectors should be indexed");
  console.log("preview sample:", status.data.preview[0]);

  if (IS_LOCAL) {
  console.log("\n=== 7. Pause learning ===");
  const paused = await reqOk("/api/v1/knowledge/page-voice", {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ learningPaused: true }),
  });
  assert(paused.data.learningPaused === true, "should be paused");
  console.log("OK paused");

  console.log("\n=== 8. Echo webhook (should skip while paused) ===");
  const custWebhook = await postMetaWebhook(
    customerWebhookPayload(PAGE_ID, CUSTOMER_PSID, "Hello, do you have red shoes?", `mid_cust_pause_${Date.now()}`)
  );
  assert(custWebhook.ok, `customer webhook failed: ${custWebhook.status}`);
  await sleep(1500);

  const echoWebhook = await postMetaWebhook(
    ownerEchoPayload(
      PAGE_ID,
      CUSTOMER_PSID,
      "Hi! Yes we have red sneakers in stock.",
      `mid_echo_pause_${Date.now()}`
    )
  );
  assert(echoWebhook.ok, `echo webhook failed: ${echoWebhook.status}`);
  await sleep(1000);

  const afterPaused = await reqOk("/api/v1/knowledge/page-voice", { headers: auth });
  assert(afterPaused.data.pairCount === pairsBefore + 3, "pair count should stay unchanged while paused");
  console.log("OK echo skipped while paused");

  console.log("\n=== 9. Resume + echo capture ===");
  await reqOk("/api/v1/knowledge/page-voice", {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ learningPaused: false }),
  });

  const cust2 = await postMetaWebhook(
    customerWebhookPayload(
      PAGE_ID,
      CUSTOMER_PSID,
      "Hello, do you have red shoes?",
      `mid_cust_capture_${Date.now()}`
    )
  );
  assert(cust2.ok, "customer webhook 2 failed");
  await sleep(2000);

  const echo2 = await postMetaWebhook(
    ownerEchoPayload(
      PAGE_ID,
      CUSTOMER_PSID,
      "Hi! Yes we have red sneakers in stock.",
      `mid_echo_capture_${Date.now()}`
    )
  );
  assert(echo2.ok, "echo webhook 2 failed");
  await sleep(2000);

  const afterEcho = await reqOk("/api/v1/knowledge/page-voice", { headers: auth });
  assert(
    afterEcho.data.pairCount === pairsBefore + 4,
    `expected ${pairsBefore + 4} pairs after echo, got ${afterEcho.data.pairCount}`
  );
  console.log("OK echo captured, pairCount=", afterEcho.data.pairCount);

  console.log("\n=== 10. Bot echo should NOT be captured ===");
  await postMetaWebhook(
    customerWebhookPayload(
      PAGE_ID,
      CUSTOMER_PSID,
      "Another question about shoes",
      `mid_cust_bot_${Date.now()}`
    )
  );
  await sleep(1500);
  await postMetaWebhook(
    ownerEchoPayload(
      PAGE_ID,
      CUSTOMER_PSID,
      "This is a bot reply from the API.",
      `mid_bot_${Date.now()}`,
      META_APP_ID
    )
  );
  await sleep(1000);
  const afterBot = await reqOk("/api/v1/knowledge/page-voice", { headers: auth });
  assert(afterBot.data.pairCount === pairsBefore + 4, "bot echo should not add a pair");
  console.log("OK bot echo filtered");
  } else {
    console.log("\n=== 7–10. Echo webhook tests (local only) ===");
    console.log("SKIP on deployed API");
  }

  console.log("\n=== 11. Re-sync ===");
  const sync = await reqOk("/api/v1/knowledge/page-voice/sync", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const syncJob = await pollJob(sync.data.jobId, auth);
  assert(syncJob.status === "completed", syncJob.error);
  console.log("OK re-sync", syncJob.stats);

  console.log("\n=== 12. Chat uses page voice (tone context) ===");
  const chat = await reqOk("/api/v1/chat", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      channel: "test",
      externalUserId: "test_user_pv",
      message: "What are your opening hours?",
    }),
  });
  assert(chat.data.reply?.content, "chat should return reply");
  console.log("reply:", chat.data.reply.content.slice(0, 120));

  console.log("\n✅ All page voice tests passed");
}

main().catch((err) => {
  console.error("\n❌", err.message);
  process.exit(1);
});
