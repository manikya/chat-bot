#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function hasArg(name) {
  return process.argv.includes(`--${name}`);
}

function aws(args, options = {}) {
  return execFileSync("aws", args, {
    env: options.env,
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

function envFromCredentialsCsv(csvPath, region) {
  const lines = readFileSync(csvPath, "utf8")
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  const headers = lines[0].split(",").map((s) => s.trim());
  const vals = lines[1].split(",").map((s) => s.trim());
  const row = Object.fromEntries(headers.map((x, i) => [x, vals[i]]));
  return {
    ...process.env,
    AWS_ACCESS_KEY_ID: row["Access key ID"],
    AWS_SECRET_ACCESS_KEY: row["Secret access key"],
    AWS_DEFAULT_REGION: region,
  };
}

function parseSecretName(name, prefix) {
  const cleanPrefix = prefix.replace(/\/$/, "");
  if (!name.startsWith(`${cleanPrefix}/`)) return null;
  const rest = name.slice(cleanPrefix.length + 1);
  const parts = rest.split("/");
  if (parts.length < 2) return null;
  const tenantId = parts.shift();
  const namespace = parts.join("/");
  if (!tenantId || !namespace) return null;
  return { tenantId, namespace };
}

function dynamoValue(value) {
  if (value == null) return { NULL: true };
  if (typeof value === "string") return { S: value };
  if (typeof value === "number") return { N: String(value) };
  if (typeof value === "boolean") return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(dynamoValue) };
  if (typeof value === "object") {
    return { M: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, dynamoValue(v)])) };
  }
  return { S: String(value) };
}

function main() {
  const region = arg("region", "us-east-1");
  const table = arg("table", "commercechat-dev-storage-main");
  const prefix = arg("prefix", "commercechat");
  const credentialsCsv = arg("credentials-csv", "/Users/manikya/Downloads/manikya_accessKeys (1).csv");
  const shouldDelete = hasArg("delete");
  const env = envFromCredentialsCsv(credentialsCsv, region);

  const list = JSON.parse(
    aws(
      [
        "secretsmanager",
        "list-secrets",
        "--filters",
        `Key=name,Values=${prefix}/`,
        "--max-results",
        "100",
      ],
      { env }
    )
  );

  const secrets = list.SecretList ?? [];
  let migrated = 0;
  let skipped = 0;
  let deleted = 0;

  for (const secret of secrets) {
    const name = secret.Name;
    const parsed = parseSecretName(name, prefix);
    if (!parsed) {
      console.log(`skip ${name}: unexpected name format`);
      skipped += 1;
      continue;
    }

    const value = JSON.parse(
      aws(["secretsmanager", "get-secret-value", "--secret-id", name], { env })
    );
    if (!value.SecretString) {
      console.log(`skip ${name}: no SecretString`);
      skipped += 1;
      continue;
    }

    const payload = JSON.parse(value.SecretString);
    const now = new Date().toISOString();
    const item = {
      PK: { S: `TENANT#${parsed.tenantId}` },
      SK: { S: `SECRET#${parsed.namespace}` },
      payload: dynamoValue(payload),
      migratedFrom: { S: "secrets-manager" },
      migratedSecretName: { S: name },
      updatedAt: { S: now },
    };

    aws(["dynamodb", "put-item", "--table-name", table, "--item", JSON.stringify(item)], {
      env,
    });
    migrated += 1;
    console.log(`migrated ${name} -> TENANT#${parsed.tenantId} SECRET#${parsed.namespace}`);

    if (shouldDelete) {
      aws(
        [
          "secretsmanager",
          "delete-secret",
          "--secret-id",
          name,
          "--force-delete-without-recovery",
        ],
        { env }
      );
      deleted += 1;
      console.log(`deleted ${name}`);
    }
  }

  console.log(JSON.stringify({ found: secrets.length, migrated, skipped, deleted }, null, 2));
}

main();
