#!/usr/bin/env node
/**
 * One-time (per env) S3 Vectors bucket setup. Run before deploy if the deploy IAM user
 * cannot create AWS::S3Vectors::VectorBucket via CloudFormation.
 *
 *   node scripts/create-s3-vectors-bucket.mjs --env=dev
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CreateVectorBucketCommand, S3VectorsClient } from "@aws-sdk/client-s3vectors";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const LOCAL_API_ENV = join(ROOT, "apps/api/.env");

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function loadLocalApiEnv() {
  if (!existsSync(LOCAL_API_ENV)) return;
  for (const line of readFileSync(LOCAL_API_ENV, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

function parseCredentialsCsv(csvPath) {
  const text = readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "").trim();
  const [headerLine, valueLine] = text.split(/\r?\n/);
  const headers = headerLine.split(",").map((h) => h.trim());
  const values = valueLine.split(",").map((v) => v.trim());
  const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  return {
    accessKeyId: row["Access key ID"] || row["AWSAccessKeyId"] || row["Access key"],
    secretAccessKey: row["Secret access key"] || row["AWSSecretKey"] || row["Secret key"],
  };
}

loadLocalApiEnv();

const env = arg("env", "dev");
const region = arg("region", process.env.AWS_REGION ?? "us-east-1");
const vectorBucketName = arg("bucket", `commercechat-${env}-vectors`);
const credentialsCsv = arg("credentials-csv", "/Users/manikya/Downloads/manikya_accessKeys (1).csv");

const creds = existsSync(credentialsCsv) ? parseCredentialsCsv(credentialsCsv) : null;
const client = new S3VectorsClient({
  region,
  ...(creds?.accessKeyId && creds?.secretAccessKey
    ? { credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey } }
    : {}),
});

try {
  await client.send(new CreateVectorBucketCommand({ vectorBucketName }));
  console.log(`Created S3 Vectors bucket: ${vectorBucketName} (${region})`);
} catch (err) {
  const name = err?.name ?? "";
  if (name === "ConflictException") {
    console.log(`S3 Vectors bucket already exists: ${vectorBucketName}`);
    process.exit(0);
  }
  if (name === "AccessDenied" || err?.$metadata?.httpStatusCode === 403) {
    console.error(
      `Cannot create ${vectorBucketName}: add s3vectors:CreateVectorBucket to the deploy IAM user ` +
        `(see infra/aws-deploy-iam-policy.json) or create the bucket in the AWS console.`
    );
    process.exit(1);
  }
  throw err;
}
