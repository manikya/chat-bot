import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import type { CoreConfig } from "../config";
import type { MetaCredentials } from "./types";

function credPath(config: CoreConfig, tenantId: string) {
  const dir = join(config.dataDir, "meta");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${tenantId}.json`);
}

export function loadMetaCredentials(
  tenantId: string,
  config: CoreConfig
): MetaCredentials | null {
  const path = credPath(config, tenantId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as MetaCredentials;
  } catch {
    return null;
  }
}

export function saveMetaCredentials(
  tenantId: string,
  creds: MetaCredentials,
  config: CoreConfig
): void {
  writeFileSync(credPath(config, tenantId), JSON.stringify(creds, null, 2), "utf8");
}

export function deleteMetaCredentials(tenantId: string, config: CoreConfig): void {
  const path = credPath(config, tenantId);
  if (existsSync(path)) unlinkSync(path);
}
