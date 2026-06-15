import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { CoreConfig } from "../../config";
import { getS3DataObjectText, putS3DataObject } from "../../storage/s3";
import type { CrawledPage } from "../types";

export interface StoredCrawlSnapshot {
  crawledAt: string;
  pages: CrawledPage[];
}

export function websiteCrawlObjectKey(tenantId: string, sourceId: string) {
  return `website/${tenantId}/${sourceId}/crawl.json`;
}

function localCrawlPath(config: CoreConfig, tenantId: string, sourceId: string) {
  return join(config.dataDir, "website", tenantId, `${sourceId}.json`);
}

export async function saveWebsiteCrawl(
  config: CoreConfig,
  tenantId: string,
  sourceId: string,
  pages: CrawledPage[]
) {
  const snapshot: StoredCrawlSnapshot = {
    crawledAt: new Date().toISOString(),
    pages,
  };
  const json = JSON.stringify(snapshot);

  if (config.s3DataBucket) {
    await putS3DataObject(
      config,
      websiteCrawlObjectKey(tenantId, sourceId),
      json,
      "application/json"
    );
    return websiteCrawlObjectKey(tenantId, sourceId);
  }

  const path = localCrawlPath(config, tenantId, sourceId);
  await mkdir(join(config.dataDir, "website", tenantId), { recursive: true });
  await writeFile(path, json, "utf8");
  return path;
}

export async function readWebsiteCrawl(
  config: CoreConfig,
  tenantId: string,
  sourceId: string
): Promise<StoredCrawlSnapshot | null> {
  try {
    if (config.s3DataBucket) {
      const text = await getS3DataObjectText(
        config,
        websiteCrawlObjectKey(tenantId, sourceId)
      );
      return JSON.parse(text) as StoredCrawlSnapshot;
    }
    const text = await readFile(localCrawlPath(config, tenantId, sourceId), "utf8");
    return JSON.parse(text) as StoredCrawlSnapshot;
  } catch {
    return null;
  }
}
