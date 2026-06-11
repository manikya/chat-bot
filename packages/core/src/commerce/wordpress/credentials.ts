import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import type { CoreConfig } from "../../config";
import { deleteSecret, getJsonSecret, isSecretsManagerEnabled, putJsonSecret } from "../../secrets/client";
import type { WordPressCredentials } from "./types";

function secretId(config: CoreConfig, tenantId: string): string {
  const prefix = config.metaSecretsPrefix ?? "commercechat";
  return `${prefix}/${tenantId}/wordpress`;
}

function filePath(config: CoreConfig, tenantId: string): string {
  const dir = join(config.dataDir, "wordpress");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${tenantId}.json`);
}

export async function loadWordPressCredentials(
  tenantId: string,
  config: CoreConfig
): Promise<WordPressCredentials | null> {
  if (isSecretsManagerEnabled(config)) {
    const fromSm = await getJsonSecret<WordPressCredentials>(config, secretId(config, tenantId));
    if (fromSm) return fromSm;

    const path = filePath(config, tenantId);
    if (existsSync(path)) {
      const fromFile = JSON.parse(readFileSync(path, "utf8")) as WordPressCredentials;
      await putJsonSecret(config, secretId(config, tenantId), fromFile);
      unlinkSync(path);
      return fromFile;
    }
    return null;
  }

  const path = filePath(config, tenantId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as WordPressCredentials;
  } catch {
    return null;
  }
}

export async function saveWordPressCredentials(
  tenantId: string,
  creds: WordPressCredentials,
  config: CoreConfig
): Promise<void> {
  if (isSecretsManagerEnabled(config)) {
    await putJsonSecret(config, secretId(config, tenantId), creds);
    return;
  }
  writeFileSync(filePath(config, tenantId), JSON.stringify(creds, null, 2), "utf8");
}

export async function deleteWordPressCredentials(
  tenantId: string,
  config: CoreConfig
): Promise<void> {
  if (isSecretsManagerEnabled(config)) {
    await deleteSecret(config, secretId(config, tenantId));
  }
  const path = filePath(config, tenantId);
  if (existsSync(path)) unlinkSync(path);
}
