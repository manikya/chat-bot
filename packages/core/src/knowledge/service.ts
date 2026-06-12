import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  ApiError,
  ErrorCodes,
  generateId,
  ok,
  type AuthContext,
  type IngestJob,
  type KnowledgeSource,
} from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import {
  createQueuedJob,
  getJobItem,
  hasActiveJobForSource,
  jobToResponse,
} from "../ingest/jobs";
import { deleteProductsForSource } from "../catalog/products";
import { parseCatalogCsv } from "../ingest/parsers/catalog-csv";
import { type FaqItem } from "../ingest/chunker/faq";
import { embedFaqItems } from "../ingest/faq-ingest";
import { scheduleCatalogIngestJob, scheduleFaqIngestJob, scheduleWebsiteIngestJob } from "../ingest/orchestrator";
import { saveCatalogFile } from "../ingest/storage/catalog-file";
import { createVectorStore } from "../ingest/vectors";
import { getTenantLimits } from "../tenant/service";

function toSource(item: Record<string, unknown>): KnowledgeSource {
  return {
    sourceId: item.sourceId as string,
    type: item.type as string,
    name: item.name as string,
    status: item.status as string,
    chunkCount: Number(item.chunkCount ?? 0),
    vectorCount: Number(item.vectorCount ?? 0),
    lastSyncAt: item.lastSyncAt as string | undefined,
    createdAt: item.createdAt as string | undefined,
  };
}

function toJob(item: Record<string, unknown>): IngestJob {
  return jobToResponse(item);
}

async function listSourceItems(auth: AuthContext, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(auth.tenantId),
        ":sk": "SOURCE#",
      },
    })
  );
  return (res.Items ?? []).filter((i) => i.status !== "deleted");
}

export async function countWebsiteSources(auth: AuthContext, config: CoreConfig) {
  const items = await listSourceItems(auth, config);
  return items.filter((i) => i.type === "website").length;
}

export async function hasFaqKnowledge(auth: AuthContext, config: CoreConfig) {
  const items = await listSourceItems(auth, config);
  const faq = items.find((i) => i.type === "faq");
  if (!faq) return false;
  const cfg = (faq.config as { items?: FaqItem[]; itemCount?: number }) ?? {};
  return (cfg.items?.length ?? cfg.itemCount ?? 0) > 0;
}

export async function listFaqKnowledge(auth: AuthContext, config: CoreConfig) {
  const items = await listSourceItems(auth, config);
  const faq = items.find((i) => i.type === "faq");
  const cfg = (faq?.config as { items?: FaqItem[] }) ?? {};
  return ok({
    sourceId: (faq?.sourceId as string | undefined) ?? null,
    items: cfg.items ?? [],
  });
}

export async function listKnowledgeSources(auth: AuthContext, config: CoreConfig) {
  const items = await listSourceItems(auth, config);
  return ok({ items: items.map((i) => toSource(i)) });
}

export async function createKnowledgeSource(
  auth: AuthContext,
  body: { type: string; name: string; config?: Record<string, unknown> },
  config: CoreConfig
) {
  if (!body.type || !body.name?.trim()) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "type and name are required", 400);
  }
  if (body.type === "website" && !body.config?.url) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Website URL is required", 400);
  }

  const limits = await getTenantLimits(auth, config);
  const existing = await listSourceItems(auth, config);
  if (existing.length >= limits.data!.maxSources) {
    throw new ApiError(ErrorCodes.PLAN_LIMIT_EXCEEDED, "Knowledge source limit reached", 403);
  }

  const sourceId = generateId("src_");
  const now = new Date().toISOString();
  const item = {
    PK: Keys.tenantPk(auth.tenantId),
    SK: Keys.source(sourceId),
    sourceId,
    tenantId: auth.tenantId,
    type: body.type,
    name: body.name.trim(),
    config: body.config ?? {},
    status: "active",
    chunkCount: 0,
    vectorCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const db = getDocClient(config);
  await db.send(new PutCommand({ TableName: config.tableName, Item: item }));
  return ok(toSource(item));
}

export async function createCatalogKnowledgeSource(
  auth: AuthContext,
  input: { name: string; filename: string; csvContent: string },
  config: CoreConfig
) {
  const products = parseCatalogCsv(input.csvContent);

  const limits = await getTenantLimits(auth, config);
  const existing = await listSourceItems(auth, config);
  if (existing.length >= limits.data!.maxSources) {
    throw new ApiError(ErrorCodes.PLAN_LIMIT_EXCEEDED, "Knowledge source limit reached", 403);
  }

  const sourceId = generateId("src_");
  const now = new Date().toISOString();
  await saveCatalogFile(config, auth.tenantId, sourceId, input.csvContent);

  const item = {
    PK: Keys.tenantPk(auth.tenantId),
    SK: Keys.source(sourceId),
    sourceId,
    tenantId: auth.tenantId,
    type: "catalog",
    name: input.name.trim() || "Product catalog",
    config: {
      originalFilename: input.filename,
      productCount: products.length,
      format: "csv",
    },
    status: "active",
    chunkCount: 0,
    vectorCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const db = getDocClient(config);
  await db.send(new PutCommand({ TableName: config.tableName, Item: item }));
  return ok(toSource(item));
}

export async function getKnowledgeSource(
  auth: AuthContext,
  sourceId: string,
  config: CoreConfig
) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.source(sourceId) },
    })
  );
  if (!res.Item || res.Item.status === "deleted") {
    throw new ApiError(ErrorCodes.NOT_FOUND, "Source not found", 404);
  }
  return res.Item;
}

export async function syncKnowledgeSource(
  auth: AuthContext,
  sourceId: string,
  config: CoreConfig
) {
  const source = await getKnowledgeSource(auth, sourceId, config);

  if (await hasActiveJobForSource(auth.tenantId, sourceId, config)) {
    throw new ApiError(
      ErrorCodes.VALIDATION_ERROR,
      "A sync is already in progress for this source",
      409
    );
  }

  const jobType = `${source.type as string}_sync`;
  const { jobId } = await createQueuedJob(auth.tenantId, sourceId, jobType, config);

  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.source(sourceId) },
      UpdateExpression: "SET #status = :s, #lastJobId = :j, #updatedAt = :u",
      ExpressionAttributeNames: {
        "#status": "status",
        "#lastJobId": "lastJobId",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":s": "syncing",
        ":j": jobId,
        ":u": new Date().toISOString(),
      },
    })
  );

  if (source.type === "website") {
    scheduleWebsiteIngestJob(auth.tenantId, jobId, config);
  } else if (source.type === "catalog") {
    scheduleCatalogIngestJob(auth.tenantId, jobId, config);
  } else if (source.type === "faq") {
    scheduleFaqIngestJob(auth.tenantId, jobId, config);
  } else if (source.type === "woocommerce") {
    const { scheduleWordPressCatalogIngestJob } = await import("../ingest/orchestrator");
    scheduleWordPressCatalogIngestJob(auth.tenantId, jobId, config);
  } else {
    const { updateJob } = await import("../ingest/jobs");
    await updateJob(
      auth.tenantId,
      jobId,
      {
        status: "failed",
        error: `Ingest not implemented for source type: ${source.type as string}`,
        completedAt: new Date().toISOString(),
      },
      config
    );
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.source(sourceId) },
        UpdateExpression: "SET #status = :s, #updatedAt = :u",
        ExpressionAttributeNames: { "#status": "status", "#updatedAt": "updatedAt" },
        ExpressionAttributeValues: { ":s": "error", ":u": new Date().toISOString() },
      })
    );
  }

  return ok({
    jobId,
    sourceId,
    status: "queued",
    type: jobType,
  });
}

export async function getKnowledgeJob(auth: AuthContext, jobId: string, config: CoreConfig) {
  const item = await getJobItem(auth.tenantId, jobId, config);
  return ok(toJob(item));
}

export async function getLatestJobForSource(
  auth: AuthContext,
  sourceId: string,
  config: CoreConfig
): Promise<IngestJob | null> {
  const jobs = await listKnowledgeJobs(auth, config);
  const match = jobs.data!.items.find((j) => j.sourceId === sourceId);
  return match ?? null;
}

export async function listKnowledgeJobs(auth: AuthContext, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(auth.tenantId),
        ":sk": "JOB#",
      },
    })
  );
  const items = (res.Items ?? [])
    .map((i) => toJob(i))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return ok({ items, nextCursor: null, hasMore: false });
}

export async function deleteKnowledgeSource(
  auth: AuthContext,
  sourceId: string,
  config: CoreConfig
) {
  await getKnowledgeSource(auth, sourceId, config);
  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.source(sourceId) },
      UpdateExpression: "SET #status = :d, #updatedAt = :u",
      ExpressionAttributeNames: { "#status": "status", "#updatedAt": "updatedAt" },
      ExpressionAttributeValues: { ":d": "deleted", ":u": new Date().toISOString() },
    })
  );

  const vectorStore = createVectorStore(config);
  await vectorStore.deleteBySource(auth.tenantId, sourceId);
  await deleteProductsForSource(auth.tenantId, sourceId, config);

  return ok({ sourceId, deleted: true });
}

export async function ingestFaqKnowledge(
  auth: AuthContext,
  body: { items: FaqItem[]; append?: boolean },
  config: CoreConfig
) {
  const incoming = (body.items ?? [])
    .map((i) => ({ question: i.question?.trim() ?? "", answer: i.answer?.trim() ?? "" }))
    .filter((i) => i.question && i.answer);

  if (!incoming.length) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "At least one FAQ item is required", 400);
  }

  const existingSources = await listSourceItems(auth, config);
  const existingFaq = existingSources.find((s) => s.type === "faq");
  const existingItems =
    ((existingFaq?.config as { items?: FaqItem[] } | undefined)?.items ?? []) as FaqItem[];

  let items = incoming;
  if (body.append && existingItems.length) {
    const merged = [...existingItems];
    for (const item of incoming) {
      const key = item.question.toLowerCase();
      const idx = merged.findIndex((m) => m.question.toLowerCase() === key);
      if (idx >= 0) merged[idx] = item;
      else merged.push(item);
    }
    items = merged;
  }

  if (items.length > 100) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Maximum 100 FAQ items per request", 400);
  }
  const db = getDocClient(config);
  const now = new Date().toISOString();
  let sourceId = existingFaq?.sourceId as string | undefined;

  if (!sourceId) {
    const limits = await getTenantLimits(auth, config);
    if (existingSources.length >= limits.data!.maxSources) {
      throw new ApiError(ErrorCodes.PLAN_LIMIT_EXCEEDED, "Knowledge source limit reached", 403);
    }
    sourceId = generateId("src_");
    await db.send(
      new PutCommand({
        TableName: config.tableName,
        Item: {
          PK: Keys.tenantPk(auth.tenantId),
          SK: Keys.source(sourceId),
          sourceId,
          tenantId: auth.tenantId,
          type: "faq",
          name: "FAQ",
          config: { items, itemCount: items.length },
          status: "syncing",
          chunkCount: 0,
          vectorCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      })
    );
  } else {
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.source(sourceId) },
        UpdateExpression: "SET #status = :s, #config = :cfg, #updatedAt = :u",
        ExpressionAttributeNames: {
          "#status": "status",
          "#config": "config",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":s": "syncing",
          ":cfg": { items, itemCount: items.length },
          ":u": now,
        },
      })
    );
  }

  const result = await embedFaqItems(auth.tenantId, sourceId, items, config);
  return ok({ sourceId, itemCount: result.itemCount, items, status: "active" });
}
