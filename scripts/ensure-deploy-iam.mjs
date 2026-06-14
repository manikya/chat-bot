#!/usr/bin/env node
/**
 * Attach infra/aws-deploy-iam-policy.json to the deploy IAM user (customer-managed policy).
 * Requires IAM admin on the target account (or iam:CreatePolicy + iam:AttachUserPolicy).
 */
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const POLICY_PATH = join(ROOT, "infra/aws-deploy-iam-policy.json");
const POLICY_NAME = "CommerceChatDeploy";

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function sh(cmd, args, env) {
  return execFileSync(cmd, args, { env, encoding: "utf8", stdio: "pipe" }).trim();
}

function awsCall(args, awsEnv) {
  try {
    return { ok: true, stdout: sh("aws", args, awsEnv) };
  } catch (err) {
    const stderr =
      typeof err === "object" && err && "stderr" in err ? String(err.stderr).trim() : String(err);
    return { ok: false, stderr };
  }
}

function parseCredentialsCsv(path) {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
  const [headerLine, valueLine] = text.split(/\r?\n/);
  if (!headerLine || !valueLine) throw new Error("AWS access key CSV is missing header or values");
  const headers = headerLine.split(",").map((h) => h.trim());
  const values = valueLine.split(",").map((v) => v.trim());
  const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  const accessKeyId = row["Access key ID"] || row.AWSAccessKeyId || row["Access key"];
  const secretAccessKey = row["Secret access key"] || row.AWSSecretKey || row["Secret key"];
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS access key CSV must include Access key ID and Secret access key");
  }
  return { accessKeyId, secretAccessKey };
}

function loadLocalApiEnv() {
  const path = join(ROOT, "apps/api/.env.aws");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

export function ensureDeployIam(options = {}) {
  const credentialsCsv = options.credentialsCsv ?? arg("credentials-csv", "/Users/manikya/Downloads/manikya_accessKeys (1).csv");
  const region = options.region ?? arg("region", "us-east-1");
  const iamUser = options.iamUser ?? arg("iam-user", "");
  const dryRun = options.dryRun ?? process.argv.includes("--dry-run");

  if (!existsSync(credentialsCsv)) throw new Error(`Credentials CSV not found: ${credentialsCsv}`);
  if (!existsSync(POLICY_PATH)) throw new Error(`Policy file not found: ${POLICY_PATH}`);

  loadLocalApiEnv();
  const creds = parseCredentialsCsv(credentialsCsv);
  const awsEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    AWS_DEFAULT_REGION: region,
    AWS_REGION: region,
  };

  const identity = JSON.parse(sh("aws", ["sts", "get-caller-identity"], awsEnv));
  const accountId = identity.Account;
  const userName =
    iamUser ||
    (identity.Arn?.includes(":user/") ? identity.Arn.split(":user/")[1] : "manikya");
  const policyArn = `arn:aws:iam::${accountId}:policy/${POLICY_NAME}`;
  const policyDoc = readFileSync(POLICY_PATH, "utf8");

  console.log(`Ensuring IAM policy ${POLICY_NAME} for user ${userName} (account ${accountId})`);

  const existing = awsCall(["iam", "get-policy", "--policy-arn", policyArn], awsEnv);
  if (existing.ok) {
    console.log("Updating existing managed policy version...");
    if (!dryRun) {
      const pruneOldestPolicyVersion = () => {
        const list = awsCall(
          ["iam", "list-policy-versions", "--policy-arn", policyArn, "--output", "json"],
          awsEnv
        );
        if (!list.ok) return;
        const versions = JSON.parse(list.stdout).Versions ?? [];
        const oldest = versions
          .filter((v) => !v.IsDefaultVersion)
          .sort((a, b) => String(a.CreateDate).localeCompare(String(b.CreateDate)))[0];
        if (!oldest) return;
        awsCall(
          ["iam", "delete-policy-version", "--policy-arn", policyArn, "--version-id", oldest.VersionId],
          awsEnv
        );
      };

      let update = awsCall(
        [
          "iam",
          "create-policy-version",
          "--policy-arn",
          policyArn,
          "--policy-document",
          `file://${POLICY_PATH}`,
          "--set-as-default",
        ],
        awsEnv
      );
      if (!update.ok && /LimitExceeded/i.test(update.stderr)) {
        console.log("Policy version limit reached — pruning oldest non-default version...");
        pruneOldestPolicyVersion();
        update = awsCall(
          [
            "iam",
            "create-policy-version",
            "--policy-arn",
            policyArn,
            "--policy-document",
            `file://${POLICY_PATH}`,
            "--set-as-default",
          ],
          awsEnv
        );
      }
      if (!update.ok) throw new Error(`create-policy-version failed: ${update.stderr}`);
    }
  } else if (/NoSuchEntity|not found/i.test(existing.stderr)) {
    console.log("Creating managed policy...");
    if (!dryRun) {
      const created = awsCall(
        [
          "iam",
          "create-policy",
          "--policy-name",
          POLICY_NAME,
          "--policy-document",
          `file://${POLICY_PATH}`,
          "--description",
          "CommerceChat serverless deploy permissions",
        ],
        awsEnv
      );
      if (!created.ok) throw new Error(`create-policy failed: ${created.stderr}`);
    }
  } else if (/AccessDenied|not authorized/i.test(existing.stderr)) {
    throw new Error(
      [
        "Cannot create/update IAM policy — need an admin principal with iam:CreatePolicy.",
        "Attach manually in AWS Console: IAM → Users → manikya → Add permissions → Create policy from",
        POLICY_PATH,
        "",
        "Or run:",
        `  aws iam create-policy --policy-name ${POLICY_NAME} --policy-document file://${POLICY_PATH}`,
        `  aws iam attach-user-policy --user-name ${userName} --policy-arn ${policyArn}`,
      ].join("\n")
    );
  } else {
    throw new Error(`get-policy failed: ${existing.stderr}`);
  }

  const attached = awsCall(
    ["iam", "list-attached-user-policies", "--user-name", userName, "--output", "json"],
    awsEnv
  );
  if (!attached.ok) {
    throw new Error(`list-attached-user-policies failed: ${attached.stderr}`);
  }

  const policies = JSON.parse(attached.stdout).AttachedPolicies ?? [];
  const already = policies.some((p) => p.PolicyArn === policyArn);
  if (already) {
    console.log(`Policy already attached to ${userName}.`);
    return { userName, policyArn, attached: true, updated: true };
  }

  console.log(`Attaching ${POLICY_NAME} to ${userName}...`);
  if (!dryRun) {
    const attach = awsCall(
      ["iam", "attach-user-policy", "--user-name", userName, "--policy-arn", policyArn],
      awsEnv
    );
    if (!attach.ok) {
      throw new Error(
        [
          `attach-user-policy failed: ${attach.stderr}`,
          "Attach manually in IAM console, then rerun deploy with --with-ingest-step-functions.",
        ].join("\n")
      );
    }
  }

  console.log("Deploy IAM policy ready.");
  return { userName, policyArn, attached: !already, updated: true };
}

if (process.argv[1]?.endsWith("ensure-deploy-iam.mjs")) {
  try {
    ensureDeployIam();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
