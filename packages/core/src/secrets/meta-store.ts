import { join } from "path";
import type { CoreConfig } from "../config";
import type { MessengerCredentials, MetaCredentials } from "../channels/types";
import { deleteTenantSecret, loadTenantSecret, saveTenantSecret } from "./backend";

export type MetaSecretKind = "whatsapp" | "messenger";

function namespace(kind: MetaSecretKind): string {
  return `meta/${kind}`;
}

function filePath(config: CoreConfig, tenantId: string, kind: MetaSecretKind): string {
  const filename = kind === "messenger" ? `${tenantId}-messenger.json` : `${tenantId}.json`;
  return join(config.dataDir, "meta", filename);
}

export function loadMetaCredentialsFromStore(
  tenantId: string,
  config: CoreConfig
): Promise<MetaCredentials | null> {
  return loadTenantSecret<MetaCredentials>(config, tenantId, namespace("whatsapp"), filePath(config, tenantId, "whatsapp"));
}

export function saveMetaCredentialsToStore(
  tenantId: string,
  creds: MetaCredentials,
  config: CoreConfig
): Promise<void> {
  return saveTenantSecret(config, tenantId, namespace("whatsapp"), filePath(config, tenantId, "whatsapp"), creds);
}

export function deleteMetaCredentialsFromStore(
  tenantId: string,
  config: CoreConfig
): Promise<void> {
  return deleteTenantSecret(config, tenantId, namespace("whatsapp"), filePath(config, tenantId, "whatsapp"));
}

export function loadMessengerCredentialsFromStore(
  tenantId: string,
  config: CoreConfig
): Promise<MessengerCredentials | null> {
  return loadTenantSecret<MessengerCredentials>(
    config,
    tenantId,
    namespace("messenger"),
    filePath(config, tenantId, "messenger")
  );
}

export function saveMessengerCredentialsToStore(
  tenantId: string,
  creds: MessengerCredentials,
  config: CoreConfig
): Promise<void> {
  return saveTenantSecret(
    config,
    tenantId,
    namespace("messenger"),
    filePath(config, tenantId, "messenger"),
    creds
  );
}

export function deleteMessengerCredentialsFromStore(
  tenantId: string,
  config: CoreConfig
): Promise<void> {
  return deleteTenantSecret(
    config,
    tenantId,
    namespace("messenger"),
    filePath(config, tenantId, "messenger")
  );
}
