/**
 * E2E: confirm ingest writes to S3 Vectors on AWS (S3VectorStore, not local files).
 *
 * 1. FAQ POST (sync) → billing overview vectors > 0
 * 2. Catalog sync (async via Step Functions/SQS) → job completed → vector count grows
 * 3. Optional: ListVectors via AWS API on tenant index
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ListVectorsCommand, S3VectorsClient } from "@aws-sdk/client-s3vectors";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_CSV = join(__dirname, "../../admin/public/sample-products.csv");
const API = (process.env.API_URL ?? "https://fimfx57xwl.execute-api.us-east-1.amazonaws.com").replace(
  /\/$/,
  ""
);
const VECTOR_BUCKET = process.env.S3_VECTORS_BUCKET ?? "commercechat-dev-vectors";
const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";
const email = process.env.TEST_EMAIL ?? `vectors-${Date.now()}@example.com`;
const password = process.env.TEST_PASSWORD ?? "TestPassword123!";

let passed = 0;
let failed = 0;

function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function fail(label, err) {
  failed += 1;
  console.error(`  ✗ ${label}:`, err instanceof Error ? err.message : err);
}

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { res, json };
}

async function reqOk(path, opts = {}) {
  const { res, json } = await req(path, opts);
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
  if (json && json.success === false) throw new Error(`${path}: ${JSON.stringify(json)}`);
  return json;
}

function loadAwsCreds() {
  const csv = process.env.AWS_CREDENTIALS_CSV ?? "/Users/manikya/Downloads/manikya_accessKeys (1).csv";
  if (!existsSync(csv)) return null;
  const text = readFileSync(csv, "utf8").replace(/^\uFEFF/, "").trim();
  const [headerLine, valueLine] = text.split(/\r?\n/);
  const headers = headerLine.split(",").map((h) => h.trim());
  const values = valueLine.split(",").map((v) => v.trim());
  const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  const accessKeyId = row["Access key ID"] || row.AWSAccessKeyId;
  const secretAccessKey = row["Secret access key"] || row.AWSSecretKey;
  if (!accessKeyId || !secretAccessKey) return null;
  return { accessKeyId, secretAccessKey };
}

function tenantIndexName(tenantId) {
  const safe = tenantId.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `tenant-${safe}`;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollJob(auth, jobId, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const job = await reqOk(`/api/v1/knowledge/jobs/${jobId}`, { headers: auth });
    const status = job.data?.status;
    if (status === "completed") return job.data;
    if (status === "failed") {
      throw new Error(job.data?.error ?? "ingest job failed");
    }
    await sleep(2000);
  }
  throw new Error("ingest job timed out");
}

async function listVectorCount(tenantId) {
  const creds = loadAwsCreds();
  if (!creds) return null;
  const client = new S3VectorsClient({
    region: AWS_REGION,
    credentials: creds,
  });
  const indexName = tenantIndexName(tenantId);
  let count = 0;
  let nextToken;
  do {
    const res = await client.send(
      new ListVectorsCommand({
        vectorBucketName: VECTOR_BUCKET,
        indexName,
        maxResults: 500,
        nextToken,
      })
    );
    count += (res.vectors ?? []).length;
    nextToken = res.nextToken;
  } while (nextToken);
  return count;
}

function buildMultipart(fields, file) {
  const boundary = "----VectorsTestBoundary";
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
  console.log(`API: ${API}`);
  console.log(`S3 Vectors bucket: ${VECTOR_BUCKET}\n`);

  let auth;
  let tenantId;

  try {
    await reqOk("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeName: "Vectors Test Store",
        name: "Tester",
        email,
        password,
        timezone: "Asia/Colombo",
      }),
    });
    const login = await reqOk("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    auth = { Authorization: `Bearer ${login.data.accessToken}` };
    const me = await reqOk("/api/v1/tenants/me", { headers: auth });
    tenantId = me.data?.id ?? me.data?.tenantId;
    ok(`signup + login (${email})`);
  } catch (e) {
    fail("auth", e);
    process.exit(1);
  }

  try {
    const faq = await reqOk("/api/v1/knowledge/faq", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            question: "What is your return policy?",
            answer: "Returns accepted within 30 days with receipt.",
          },
          {
            question: "Do you ship internationally?",
            answer: "Yes, we ship to over 40 countries.",
          },
        ],
      }),
    });
    const chunks = faq.data?.itemCount ?? 0;
    if (chunks <= 0) throw new Error("FAQ ingest returned no items");
    ok(`FAQ ingested synchronously to S3 Vectors (${chunks} items)`);
  } catch (e) {
    fail("FAQ ingest", e);
  }

  try {
    const overview = await reqOk("/api/v1/billing/overview", { headers: auth });
    const vectors = overview.data?.resources?.vectors ?? 0;
    if (vectors <= 0) throw new Error(`expected vectors > 0, got ${vectors}`);
    ok(`billing overview vectors=${vectors} (S3VectorStore.countByTenant)`);
  } catch (e) {
    fail("billing overview vectors", e);
  }

  try {
    const sampleCsv = readFileSync(SAMPLE_CSV, "utf8");
    const mp = buildMultipart({ type: "catalog", name: "Vector test catalog" }, sampleCsv);
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
    const job = await pollJob(auth, sync.data.jobId, 45);
    const chunks = job.stats?.chunksCreated ?? 0;
    if (chunks <= 0) throw new Error("catalog job produced no chunks");
    ok(`catalog ingest via pipeline (job chunks=${chunks}, Step Functions/SQS)`);
  } catch (e) {
    fail("async catalog ingest", e);
  }

  try {
    const directCount = await listVectorCount(tenantId);
    if (directCount == null) {
      ok("S3 Vectors API verify skipped (no AWS credentials CSV)");
    } else if (directCount <= 0) {
      throw new Error(`ListVectors returned ${directCount}`);
    } else {
      ok(`S3 Vectors API index ${tenantIndexName(tenantId)} has ${directCount} vector(s)`);
    }
  } catch (e) {
    fail("S3 Vectors API verify", e);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
