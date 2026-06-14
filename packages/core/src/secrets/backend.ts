import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { CoreConfig } from "../config";
import { deleteSecret, getJsonSecret, putJsonSecret } from "./client";
import { deleteDynamoSecret, getDynamoSecret, putDynamoSecret } from "./dynamo-store";

export type MetaSecretsBackend = "file" | "dynamodb" | "secrets-manager";

export function resolveMetaSecretsBackend(config: CoreConfig): MetaSecretsBackend {
  if (config.metaSecretsBackend) return config.metaSecretsBackend;
  if (config.metaSecretsUseSecretsManager) return "secrets-manager";
  return "file";
}

export function isSecretsManagerBackend(config: CoreConfig): boolean {
  return resolveMetaSecretsBackend(config) === "secrets-manager";
}

function readFileJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeFileJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function secretsManagerId(config: CoreConfig, tenantId: string, namespace: string): string {
  const prefix = config.metaSecretsPrefix ?? "commercechat";
  return `${prefix}/${tenantId}/${namespace}`;
}

async function migrateToBackend<T>(
  config: CoreConfig,
  tenantId: string,
  namespace: string,
  target: MetaSecretsBackend,
  filePath: string,
  value: T
): Promise<void> {
  if (target === "dynamodb") {
    await putDynamoSecret(config, tenantId, namespace, value);
    console.log(`[secrets] migrated ${namespace} credentials to DynamoDB for`, tenantId);
    return;
  }
  if (target === "secrets-manager") {
    await putJsonSecret(config, secretsManagerId(config, tenantId, namespace), value);
    console.log(`[secrets] migrated ${namespace} credentials to Secrets Manager for`, tenantId);
    return;
  }
  writeFileJson(filePath, value);
  console.log(`[secrets] migrated ${namespace} credentials to file for`, tenantId);
}

async function loadFromAlternateBackends<T>(
  config: CoreConfig,
  tenantId: string,
  namespace: string,
  target: MetaSecretsBackend,
  filePath: string
): Promise<T | null> {
  if (target !== "dynamodb") {
    const fromDdb = await getDynamoSecret<T>(config, tenantId, namespace);
    if (fromDdb) {
      await migrateToBackend(config, tenantId, namespace, target, filePath, fromDdb);
      return fromDdb;
    }
  }

  if (target !== "secrets-manager") {
    const fromSm = await getJsonSecret<T>(config, secretsManagerId(config, tenantId, namespace));
    if (fromSm) {
      await migrateToBackend(config, tenantId, namespace, target, filePath, fromSm);
      return fromSm;
    }
  }

  if (target !== "file") {
    const fromFile = readFileJson<T>(filePath);
    if (fromFile) {
      await migrateToBackend(config, tenantId, namespace, target, filePath, fromFile);
      try {
        unlinkSync(filePath);
      } catch {
        // file may be on read-only fs (e.g. Lambda)
      }
      return fromFile;
    }
  }

  return null;
}

export async function loadTenantSecret<T>(
  config: CoreConfig,
  tenantId: string,
  namespace: string,
  filePath: string
): Promise<T | null> {
  const backend = resolveMetaSecretsBackend(config);

  if (backend === "dynamodb") {
    const fromDdb = await getDynamoSecret<T>(config, tenantId, namespace);
    if (fromDdb) return fromDdb;
    return loadFromAlternateBackends(config, tenantId, namespace, backend, filePath);
  }

  if (backend === "secrets-manager") {
    const fromSm = await getJsonSecret<T>(config, secretsManagerId(config, tenantId, namespace));
    if (fromSm) return fromSm;
    return loadFromAlternateBackends(config, tenantId, namespace, backend, filePath);
  }

  const fromFile = readFileJson<T>(filePath);
  if (fromFile) return fromFile;
  return loadFromAlternateBackends(config, tenantId, namespace, backend, filePath);
}

export async function saveTenantSecret(
  config: CoreConfig,
  tenantId: string,
  namespace: string,
  filePath: string,
  value: unknown
): Promise<void> {
  const backend = resolveMetaSecretsBackend(config);

  if (backend === "dynamodb") {
    await putDynamoSecret(config, tenantId, namespace, value);
  } else if (backend === "secrets-manager") {
    await putJsonSecret(config, secretsManagerId(config, tenantId, namespace), value);
  } else {
    writeFileJson(filePath, value);
  }

  if (backend !== "file" && existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch {
      // ignore read-only fs
    }
  }
}

export async function deleteTenantSecret(
  config: CoreConfig,
  tenantId: string,
  namespace: string,
  filePath: string
): Promise<void> {
  const backend = resolveMetaSecretsBackend(config);

  if (backend === "dynamodb") {
    await deleteDynamoSecret(config, tenantId, namespace);
  } else if (backend === "secrets-manager") {
    await deleteSecret(config, secretsManagerId(config, tenantId, namespace));
  }

  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch {
      // ignore
    }
  }
}
