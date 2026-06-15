import { join } from "path";
import type { CoreConfig } from "../../config";
import { deleteTenantSecret, loadTenantSecret, saveTenantSecret } from "../../secrets/backend";
import type { ShopifyCredentials } from "./types";

const NAMESPACE = "shopify";

function filePath(config: CoreConfig, tenantId: string): string {
  return join(config.dataDir, "shopify", `${tenantId}.json`);
}

export async function loadShopifyCredentials(
  tenantId: string,
  config: CoreConfig
): Promise<ShopifyCredentials | null> {
  return loadTenantSecret<ShopifyCredentials>(config, tenantId, NAMESPACE, filePath(config, tenantId));
}

export async function saveShopifyCredentials(
  tenantId: string,
  creds: ShopifyCredentials,
  config: CoreConfig
): Promise<void> {
  await saveTenantSecret(config, tenantId, NAMESPACE, filePath(config, tenantId), creds);
}

export async function deleteShopifyCredentials(
  tenantId: string,
  config: CoreConfig
): Promise<void> {
  await deleteTenantSecret(config, tenantId, NAMESPACE, filePath(config, tenantId));
}
