import { join } from "path";
import type { CoreConfig } from "../../config";
import { deleteTenantSecret, loadTenantSecret, saveTenantSecret } from "../../secrets/backend";
import type { WordPressCredentials } from "./types";

const NAMESPACE = "wordpress";

function filePath(config: CoreConfig, tenantId: string): string {
  return join(config.dataDir, "wordpress", `${tenantId}.json`);
}

export async function loadWordPressCredentials(
  tenantId: string,
  config: CoreConfig
): Promise<WordPressCredentials | null> {
  return loadTenantSecret<WordPressCredentials>(config, tenantId, NAMESPACE, filePath(config, tenantId));
}

export async function saveWordPressCredentials(
  tenantId: string,
  creds: WordPressCredentials,
  config: CoreConfig
): Promise<void> {
  await saveTenantSecret(config, tenantId, NAMESPACE, filePath(config, tenantId), creds);
}

export async function deleteWordPressCredentials(
  tenantId: string,
  config: CoreConfig
): Promise<void> {
  await deleteTenantSecret(config, tenantId, NAMESPACE, filePath(config, tenantId));
}
