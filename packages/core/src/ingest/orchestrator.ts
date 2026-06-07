import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { getTenantLimits } from "../tenant/service";
import { deleteProductsForSource, upsertProductCache } from "../catalog/products";
import { chunkCatalogProducts, toCatalogVectorChunks } from "./chunker/catalog";
import { chunkWebsiteSections, countTokens, toVectorChunks } from "./chunker/website";
import { parseCatalogCsv } from "./parsers/catalog-csv";
import { readCatalogFile } from "./storage/catalog-file";
import { crawlWebsite } from "./crawler/website";
import { createEmbeddingProvider } from "./embedding";
import { getJobItem, updateJob } from "./jobs";
import { extractPageTitle, extractSections } from "./parsers/html";
import type { ChunkMetadata, IngestJobStats } from "./types";
import { createVectorStore } from "./vectors";

async function getSourceItem(tenantId: string, sourceId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.source(sourceId) },
    })
  );
  return res.Item ?? null;
}

async function setSourceStatus(
  tenantId: string,
  sourceId: string,
  status: string,
  config: CoreConfig
) {
  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.source(sourceId) },
      UpdateExpression: "SET #status = :s, #updatedAt = :u",
      ExpressionAttributeNames: { "#status": "status", "#updatedAt": "updatedAt" },
      ExpressionAttributeValues: { ":s": status, ":u": new Date().toISOString() },
    })
  );
}

export async function runWebsiteIngestJob(
  tenantId: string,
  jobId: string,
  config: CoreConfig
): Promise<void> {
  const started = Date.now();
  const stats: IngestJobStats = {
    pagesProcessed: 0,
    chunksCreated: 0,
    tokensEmbedded: 0,
    errors: [],
  };

  let sourceId = "";

  try {
    const jobItem = await getJobItem(tenantId, jobId, config);
    sourceId = jobItem.sourceId as string;

    const source = await getSourceItem(tenantId, sourceId, config);
    if (!source || source.status === "deleted") {
      throw new Error("Source not found");
    }

    const sourceConfig = (source.config as Record<string, unknown>) ?? {};
    const startUrl = String(sourceConfig.url ?? "");
    if (!startUrl) throw new Error("Website URL missing on source");

    const auth = { tenantId } as AuthContext;
    const limitsRes = await getTenantLimits(auth, config);
    const maxVectors = Number(limitsRes.data!.maxVectors);

    const maxPages = Math.min(
      Number(sourceConfig.maxPages ?? config.ingestMaxPages),
      config.ingestMaxPages
    );
    const maxDepth = Number(sourceConfig.maxDepth ?? 2);

    const now = new Date().toISOString();
    await updateJob(tenantId, jobId, { status: "running", startedAt: now, progressPct: 5 }, config);
    await setSourceStatus(tenantId, sourceId, "syncing", config);

    const vectorStore = createVectorStore(config);
    const embedder = createEmbeddingProvider(config);
    await vectorStore.deleteBySource(tenantId, sourceId);

    const crawledAt = new Date().toISOString();
    const allDrafts: Array<{ text: string; metadata: ChunkMetadata }> = [];

    const { pages, errors: crawlErrors } = await crawlWebsite({
      startUrl,
      maxDepth,
      maxPages,
      onPage: async (_page, index) => {
        stats.pagesProcessed = index;
        const pct = Math.min(10 + Math.floor((index / maxPages) * 50), 60);
        await updateJob(tenantId, jobId, { stats: { ...stats }, progressPct: pct }, config);
      },
    });

    stats.pagesProcessed = pages.length;
    stats.errors = crawlErrors;

    for (const page of pages) {
      const pageTitle = extractPageTitle(page.html, page.url);
      const sections = extractSections(page.html, pageTitle);
      allDrafts.push(...chunkWebsiteSections(sourceId, page.url, pageTitle, sections, crawledAt));
    }

    if (allDrafts.length === 0) {
      throw new Error(
        stats.pagesProcessed === 0
          ? "No pages could be crawled"
          : "No text content extracted from crawled pages"
      );
    }

    const vectorCount = await vectorStore.countByTenant(tenantId);
    if (vectorCount + allDrafts.length > maxVectors) {
      throw new Error(`Plan vector limit exceeded (max ${maxVectors})`);
    }

    await updateJob(
      tenantId,
      jobId,
      { stats: { ...stats, chunksCreated: allDrafts.length }, progressPct: 70 },
      config
    );

    const texts = allDrafts.map((d) => d.text);
    const embeddings = await embedder.embed(texts);
    stats.tokensEmbedded = countTokens(texts);

    const vectorChunks = toVectorChunks(sourceId, allDrafts, embeddings);
    await vectorStore.upsert(tenantId, vectorChunks);

    stats.chunksCreated = vectorChunks.length;
    stats.durationSec = Math.round((Date.now() - started) / 1000);
    const completedAt = new Date().toISOString();

    await updateJob(
      tenantId,
      jobId,
      {
        status: "completed",
        stats,
        progressPct: 100,
        completedAt,
        error: null,
      },
      config
    );

    const db = getDocClient(config);
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(tenantId), SK: Keys.source(sourceId) },
        UpdateExpression:
          "SET #status = :s, #lastSyncAt = :l, #lastJobId = :j, #chunkCount = :c, #vectorCount = :v, #updatedAt = :u",
        ExpressionAttributeNames: {
          "#status": "status",
          "#lastSyncAt": "lastSyncAt",
          "#lastJobId": "lastJobId",
          "#chunkCount": "chunkCount",
          "#vectorCount": "vectorCount",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":s": "active",
          ":l": completedAt,
          ":j": jobId,
          ":c": stats.chunksCreated,
          ":v": stats.chunksCreated,
          ":u": completedAt,
        },
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stats.durationSec = Math.round((Date.now() - started) / 1000);
    await updateJob(
      tenantId,
      jobId,
      {
        status: "failed",
        stats,
        progressPct: 100,
        error: message,
        completedAt: new Date().toISOString(),
      },
      config
    );

    if (sourceId) {
      await setSourceStatus(tenantId, sourceId, "error", config);
    }
  }
}

const inFlight = new Set<string>();

export function scheduleWebsiteIngestJob(
  tenantId: string,
  jobId: string,
  config: CoreConfig
): void {
  scheduleIngestJob("website", tenantId, jobId, config, () =>
    runWebsiteIngestJob(tenantId, jobId, config)
  );
}

export async function runCatalogIngestJob(
  tenantId: string,
  jobId: string,
  config: CoreConfig
): Promise<void> {
  const started = Date.now();
  const stats: IngestJobStats = {
    pagesProcessed: 0,
    chunksCreated: 0,
    tokensEmbedded: 0,
    errors: [],
  };

  let sourceId = "";

  try {
    const jobItem = await getJobItem(tenantId, jobId, config);
    sourceId = jobItem.sourceId as string;

    const source = await getSourceItem(tenantId, sourceId, config);
    if (!source || source.status === "deleted") {
      throw new Error("Source not found");
    }

    const auth = { tenantId } as AuthContext;
    const limitsRes = await getTenantLimits(auth, config);
    const maxVectors = Number(limitsRes.data!.maxVectors);

    const now = new Date().toISOString();
    await updateJob(tenantId, jobId, { status: "running", startedAt: now, progressPct: 10 }, config);
    await setSourceStatus(tenantId, sourceId, "syncing", config);

    const csvText = await readCatalogFile(config, tenantId, sourceId);
    const products = parseCatalogCsv(csvText);
    stats.pagesProcessed = products.length;

    await updateJob(tenantId, jobId, { stats: { ...stats }, progressPct: 30 }, config);

    const vectorStore = createVectorStore(config);
    const embedder = createEmbeddingProvider(config);
    await vectorStore.deleteBySource(tenantId, sourceId);
    await deleteProductsForSource(tenantId, sourceId, config);

    const syncedAt = new Date().toISOString();
    const drafts = chunkCatalogProducts(sourceId, products, syncedAt);

    const vectorCount = await vectorStore.countByTenant(tenantId);
    if (vectorCount + drafts.length > maxVectors) {
      throw new Error(`Plan vector limit exceeded (max ${maxVectors})`);
    }

    const texts = drafts.map((d) => d.text);
    const embeddings = await embedder.embed(texts);
    stats.tokensEmbedded = countTokens(texts);

    await updateJob(
      tenantId,
      jobId,
      { stats: { ...stats, chunksCreated: drafts.length }, progressPct: 70 },
      config
    );

    const vectorChunks = toCatalogVectorChunks(sourceId, drafts, embeddings);
    await vectorStore.upsert(tenantId, vectorChunks);
    await upsertProductCache(tenantId, sourceId, products, config);

    stats.chunksCreated = vectorChunks.length;
    stats.durationSec = Math.round((Date.now() - started) / 1000);
    const completedAt = new Date().toISOString();

    await updateJob(
      tenantId,
      jobId,
      {
        status: "completed",
        stats,
        progressPct: 100,
        completedAt,
        error: null,
      },
      config
    );

    const db = getDocClient(config);
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(tenantId), SK: Keys.source(sourceId) },
        UpdateExpression:
          "SET #status = :s, #lastSyncAt = :l, #lastJobId = :j, #chunkCount = :c, #vectorCount = :v, #updatedAt = :u, #config = :cfg",
        ExpressionAttributeNames: {
          "#status": "status",
          "#lastSyncAt": "lastSyncAt",
          "#lastJobId": "lastJobId",
          "#chunkCount": "chunkCount",
          "#vectorCount": "vectorCount",
          "#updatedAt": "updatedAt",
          "#config": "config",
        },
        ExpressionAttributeValues: {
          ":s": "active",
          ":l": completedAt,
          ":j": jobId,
          ":c": stats.chunksCreated,
          ":v": stats.chunksCreated,
          ":u": completedAt,
          ":cfg": {
            ...(source.config as Record<string, unknown>),
            productCount: products.length,
            lastIngestAt: completedAt,
          },
        },
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stats.durationSec = Math.round((Date.now() - started) / 1000);
    await updateJob(
      tenantId,
      jobId,
      {
        status: "failed",
        stats,
        progressPct: 100,
        error: message,
        completedAt: new Date().toISOString(),
      },
      config
    );

    if (sourceId) {
      await setSourceStatus(tenantId, sourceId, "error", config);
    }
  }
}

export function scheduleCatalogIngestJob(
  tenantId: string,
  jobId: string,
  config: CoreConfig
): void {
  scheduleIngestJob("catalog", tenantId, jobId, config, () =>
    runCatalogIngestJob(tenantId, jobId, config)
  );
}

function scheduleIngestJob(
  _kind: string,
  tenantId: string,
  jobId: string,
  config: CoreConfig,
  run: () => Promise<void>
): void {
  const key = `${tenantId}:${jobId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);

  void run()
    .catch((err) => console.error("[ingest]", jobId, err))
    .finally(() => inFlight.delete(key));
}
