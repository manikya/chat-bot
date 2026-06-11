import type { CoreConfig } from "../config";
import type { MessengerCredentials } from "./types";
import {
  deleteMessengerCredentialsFromStore,
  loadMessengerCredentialsFromStore,
  saveMessengerCredentialsToStore,
} from "../secrets/meta-store";

export async function loadMessengerCredentials(
  tenantId: string,
  config: CoreConfig
): Promise<MessengerCredentials | null> {
  return loadMessengerCredentialsFromStore(tenantId, config);
}

export async function saveMessengerCredentials(
  tenantId: string,
  creds: MessengerCredentials,
  config: CoreConfig
): Promise<void> {
  await saveMessengerCredentialsToStore(tenantId, creds, config);
}

export async function deleteMessengerCredentials(
  tenantId: string,
  config: CoreConfig
): Promise<void> {
  await deleteMessengerCredentialsFromStore(tenantId, config);
}
