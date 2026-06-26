#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const API_DIR = join(ROOT, "apps/api");
const LOCAL_API_ENV = join(API_DIR, ".env");
const LOCAL_API_ENV_AWS = join(API_DIR, ".env.aws");
const BUILD_DIR = join(API_DIR, "dist/handlers");
const OUT_DIR = join(ROOT, ".aws-deploy", "lambda-code");

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function loadEnvFile(path, override = false) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}

function parseCredentialsCsv(path) {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
  const [headerLine, valueLine] = text.split(/\r?\n/);
  if (!headerLine || !valueLine) throw new Error("AWS access key CSV is missing header or values");
  const headers = headerLine.split(",").map((h) => h.trim());
  const values = valueLine.split(",").map((v) => v.trim());
  const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  const accessKeyId = row["Access key ID"] || row["AWSAccessKeyId"] || row["Access key"];
  const secretAccessKey = row["Secret access key"] || row["AWSSecretKey"] || row["Secret key"];
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS access key CSV must include Access key ID and Secret access key");
  }
  return { accessKeyId, secretAccessKey };
}

function sh(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? "pipe",
  });
}

function parseHandlers(raw) {
  const handlers = raw
    .split(",")
    .map((handler) => handler.trim())
    .filter(Boolean);
  if (!handlers.length) throw new Error("Pass handlers with --handlers=widget,chat-api");
  return [...new Set(handlers)];
}

function stackLambdaFunctions(stackName, awsEnv) {
  const raw = sh(
    "aws",
    ["cloudformation", "describe-stack-resources", "--stack-name", stackName, "--output", "json"],
    { env: awsEnv }
  );
  return (JSON.parse(raw).StackResources ?? [])
    .filter((resource) => resource.ResourceType === "AWS::Lambda::Function")
    .map((resource) => String(resource.PhysicalResourceId ?? ""))
    .filter(Boolean);
}

function functionsForHandler(functionNames, env, handler) {
  const prefix = `commercechat-${env}-${handler}`;
  return functionNames.filter((name) => name === prefix || name.startsWith(`${prefix}-`));
}

function zipHandler(handler, artifactDir) {
  const bundle = join(BUILD_DIR, `${handler}.cjs`);
  if (!existsSync(bundle)) throw new Error(`Missing Lambda bundle: ${bundle}`);
  mkdirSync(artifactDir, { recursive: true });
  const zipPath = join(artifactDir, `${handler}.zip`);
  sh("zip", ["-j", "-q", zipPath, bundle]);
  return zipPath;
}

async function main() {
  const env = arg("env", "dev");
  const region = arg("region", "us-east-1");
  const stackName = arg("stack", `commercechat-${env}`);
  const credentialsCsv = arg("credentials-csv", "/Users/manikya/Downloads/manikya_accessKeys (1).csv");
  const handlers = parseHandlers(arg("handlers", ""));
  const dryRun = process.argv.includes("--dry-run");

  if (!existsSync(credentialsCsv)) throw new Error(`Credentials CSV not found: ${credentialsCsv}`);
  loadEnvFile(LOCAL_API_ENV, false);
  loadEnvFile(LOCAL_API_ENV_AWS, true);
  const creds = parseCredentialsCsv(credentialsCsv);
  const awsEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    AWS_REGION: region,
  };

  console.log(`Fast Lambda deploy | stack ${stackName} | region ${region}`);
  console.log(`Handlers: ${handlers.join(", ")}`);

  sh("npm", ["run", "build:lambdas", "--workspace=@commercechat/api", "--", `--handlers=${handlers.join(",")}`], {
    cwd: ROOT,
    stdio: "inherit",
  });

  const deployedFunctions = stackLambdaFunctions(stackName, awsEnv);
  const artifactDir = join(OUT_DIR, String(Date.now()));

  for (const handler of handlers) {
    const targets = functionsForHandler(deployedFunctions, env, handler);
    if (!targets.length) {
      throw new Error(`No deployed Lambda functions found for handler ${handler} in stack ${stackName}`);
    }
    const zipPath = zipHandler(handler, artifactDir);
    console.log(`\n${handler}.zip -> ${targets.length} function${targets.length === 1 ? "" : "s"}`);
    for (const functionName of targets) {
      console.log(`Updating ${functionName}`);
      if (dryRun) continue;
      sh(
        "aws",
        [
          "lambda",
          "update-function-code",
          "--function-name",
          functionName,
          "--zip-file",
          `fileb://${zipPath}`,
          "--region",
          region,
          "--output",
          "json",
        ],
        { env: awsEnv }
      );
      sh("aws", ["lambda", "wait", "function-updated-v2", "--function-name", functionName, "--region", region], {
        env: awsEnv,
      });
    }
  }

  console.log("\nFast Lambda deploy complete.");
  console.log(`Updated handlers: ${handlers.map((handler) => basename(handler)).join(", ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
