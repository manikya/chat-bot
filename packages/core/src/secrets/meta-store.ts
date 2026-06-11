import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import type { CoreConfig } from "../config";
import type { MessengerCredentials, MetaCredentials } from "../channels/types";
import { deleteSecret, getJsonSecret, isSecretsManagerEnabled, putJsonSecret } from "./client";

export type MetaSecretKind = "whatsapp" | "messenger";

function secretId(config: CoreConfig, tenantId: string, kind: MetaSecretKind): string {
  const prefix = config.metaSecretsPrefix ?? "commercechat";
  return `${prefix}/${tenantId}/meta/${kind}`;
}

function filePath(config: CoreConfig, tenantId: string, kind: MetaSecretKind): string {
  const dir = join(config.dataDir, "meta");
  mkdirSync(dir, { recursive: true });
  const filename = kind === "messenger" ? `${tenantId}-messenger.json` : `${tenantId}.json`;
  return join(dir, filename);
}

function readFileJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function loadJson<T>(
  config: CoreConfig,
  tenantId: string,
  kind: MetaSecretKind
): Promise<T | null> {
  if (isSecretsManagerEnabled(config)) {
    const fromSm = await getJsonSecret<T>(config, secretId(config, tenantId, kind));
    if (fromSm) return fromSm;

    const path = filePath(config, tenantId, kind);
    const fromFile = readFileJson<T>(path);
    if (fromFile) {
      await putJsonSecret(config, secretId(config, tenantId, kind), fromFile);
      unlinkSync(path);
      console.log(`[meta-secrets] migrated ${kind} credentials to Secrets Manager for`, tenantId);
      return fromFile;
    }
    return null;
  }

  return readFileJson<T>(filePath(config, tenantId, kind));
}

async function saveJson(
  config: CoreConfig,
  tenantId: string,
  kind: MetaSecretKind,
  value: unknown
): Promise<void> {
  if (isSecretsManagerEnabled(config)) {
    await putJsonSecret(config, secretId(config, tenantId, kind), value);
    const path = filePath(config, tenantId, kind);
    if (existsSync(path)) unlinkSync(path);
    return;
  }

  writeFileSync(filePath(config, tenantId, kind), JSON.stringify(value, null, 2), "utf8");
}

async function deleteJson(
  config: CoreConfig,
  tenantId: string,
  kind: MetaSecretKind
): Promise<void> {
  if (isSecretsManagerEnabled(config)) {
    await deleteSecret(config, secretId(config, tenantId, kind));
  }
  const path = filePath(config, tenantId, kind);
  if (existsSync(path)) unlinkSync(path);
}

export function loadMetaCredentialsFromStore(
  tenantId: string,
  config: CoreConfig
): Promise<MetaCredentials | null> {
  return loadJson<MetaCredentials>(config, tenantId, "whatsapp");
}

export function saveMetaCredentialsToStore(
  tenantId: string,
  creds: MetaCredentials,
  config: CoreConfig
): Promise<void> {
  return saveJson(config, tenantId, "whatsapp", creds);
}

export function deleteMetaCredentialsFromStore(
  tenantId: string,
  config: CoreConfig
): Promise<void> {
  return deleteJson(config, tenantId, "whatsapp");
}

export function loadMessengerCredentialsFromStore(
  tenantId: string,
  config: CoreConfig
): Promise<MessengerCredentials | null> {
  return loadJson<MessengerCredentials>(config, tenantId, "messenger");
}

export function saveMessengerCredentialsToStore(
  tenantId: string,
  creds: MessengerCredentials,
  config: CoreConfig
): Promise<void> {
  return saveJson(config, tenantId, "messenger", creds);
}

export function deleteMessengerCredentialsFromStore(
  tenantId: string,
  config: CoreConfig
): Promise<void> {
  return deleteJson(config, tenantId, "messenger");
}
