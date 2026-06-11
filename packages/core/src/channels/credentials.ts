import type { CoreConfig } from "../config";
import type { MetaCredentials } from "./types";
import {
  deleteMetaCredentialsFromStore,
  loadMetaCredentialsFromStore,
  saveMetaCredentialsToStore,
} from "../secrets/meta-store";

export async function loadMetaCredentials(
  tenantId: string,
  config: CoreConfig
): Promise<MetaCredentials | null> {
  return loadMetaCredentialsFromStore(tenantId, config);
}

export async function saveMetaCredentials(
  tenantId: string,
  creds: MetaCredentials,
  config: CoreConfig
): Promise<void> {
  await saveMetaCredentialsToStore(tenantId, creds, config);
}

export async function deleteMetaCredentials(
  tenantId: string,
  config: CoreConfig
): Promise<void> {
  await deleteMetaCredentialsFromStore(tenantId, config);
}
