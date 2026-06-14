import type { CoreConfig } from "../config";
import type { InstagramCredentials } from "./types";
import {
  deleteInstagramCredentialsFromStore,
  loadInstagramCredentialsFromStore,
  saveInstagramCredentialsToStore,
} from "../secrets/meta-store";

export async function loadInstagramCredentials(
  tenantId: string,
  config: CoreConfig
): Promise<InstagramCredentials | null> {
  return loadInstagramCredentialsFromStore(tenantId, config);
}

export async function saveInstagramCredentials(
  tenantId: string,
  creds: InstagramCredentials,
  config: CoreConfig
): Promise<void> {
  await saveInstagramCredentialsToStore(tenantId, creds, config);
}

export async function deleteInstagramCredentials(
  tenantId: string,
  config: CoreConfig
): Promise<void> {
  await deleteInstagramCredentialsFromStore(tenantId, config);
}
