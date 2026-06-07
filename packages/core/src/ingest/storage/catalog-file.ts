import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { CoreConfig } from "../../config";

export function catalogFilePath(config: CoreConfig, tenantId: string, sourceId: string) {
  return join(config.dataDir, "catalog", tenantId, `${sourceId}.csv`);
}

export async function saveCatalogFile(
  config: CoreConfig,
  tenantId: string,
  sourceId: string,
  content: Buffer | string
) {
  const path = catalogFilePath(config, tenantId, sourceId);
  await mkdir(join(config.dataDir, "catalog", tenantId), { recursive: true });
  await writeFile(path, content, "utf8");
  return path;
}

export async function readCatalogFile(config: CoreConfig, tenantId: string, sourceId: string) {
  const path = catalogFilePath(config, tenantId, sourceId);
  return readFile(path, "utf8");
}
