import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import type { CoreConfig } from "../config";
import type { MessengerCredentials } from "./types";

function credPath(config: CoreConfig, tenantId: string) {
  const dir = join(config.dataDir, "meta");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${tenantId}-messenger.json`);
}

export function loadMessengerCredentials(
  tenantId: string,
  config: CoreConfig
): MessengerCredentials | null {
  const path = credPath(config, tenantId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as MessengerCredentials;
  } catch {
    return null;
  }
}

export function saveMessengerCredentials(
  tenantId: string,
  creds: MessengerCredentials,
  config: CoreConfig
): void {
  writeFileSync(credPath(config, tenantId), JSON.stringify(creds, null, 2), "utf8");
}

export function deleteMessengerCredentials(tenantId: string, config: CoreConfig): void {
  const path = credPath(config, tenantId);
  if (existsSync(path)) unlinkSync(path);
}
