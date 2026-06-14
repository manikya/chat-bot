import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { CoreConfig } from "../../config";
import { getS3DataObjectText, putS3DataObject } from "../../storage/s3";

export function catalogObjectKey(tenantId: string, sourceId: string) {
  return `catalog/${tenantId}/${sourceId}.csv`;
}

export function catalogFilePath(config: CoreConfig, tenantId: string, sourceId: string) {
  return join(config.dataDir, "catalog", tenantId, `${sourceId}.csv`);
}

export async function saveCatalogFile(
  config: CoreConfig,
  tenantId: string,
  sourceId: string,
  content: Buffer | string
) {
  const text = typeof content === "string" ? content : content.toString("utf8");
  if (config.s3DataBucket) {
    const key = catalogObjectKey(tenantId, sourceId);
    await putS3DataObject(config, key, text, "text/csv");
    return key;
  }
  const path = catalogFilePath(config, tenantId, sourceId);
  await mkdir(join(config.dataDir, "catalog", tenantId), { recursive: true });
  await writeFile(path, text, "utf8");
  return path;
}

export async function readCatalogFile(config: CoreConfig, tenantId: string, sourceId: string) {
  if (config.s3DataBucket) {
    return getS3DataObjectText(config, catalogObjectKey(tenantId, sourceId));
  }
  const path = catalogFilePath(config, tenantId, sourceId);
  return readFile(path, "utf8");
}
