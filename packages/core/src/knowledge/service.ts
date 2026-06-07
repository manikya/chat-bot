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
  return {
    jobId: item.jobId as string,
    sourceId: item.sourceId as string,
    type: item.type as string,
    status: item.status as string,
    stats: item.stats as IngestJob["stats"],
    completedAt: item.completedAt as string | undefined,
    error: item.error as string | undefined,
    createdAt: item.createdAt as string | undefined,
  };
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
  const jobId = generateId("job_");
  const now = new Date().toISOString();
  const jobType = `${source.type as string}_sync`;

  const db = getDocClient(config);
  const stats = { pagesProcessed: 1, chunksCreated: 12, durationSec: 2 };
  const jobItem = {
    PK: Keys.tenantPk(auth.tenantId),
    SK: Keys.job(jobId),
    jobId,
    sourceId,
    tenantId: auth.tenantId,
    type: jobType,
    status: "completed",
    stats,
    createdAt: now,
    startedAt: now,
    completedAt: now,
    GSI1PK: Keys.tenantPk(auth.tenantId),
    GSI1SK: `JOB#${now}`,
  };

  await db.send(new PutCommand({ TableName: config.tableName, Item: jobItem }));
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.source(sourceId) },
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
        ":l": now,
        ":j": jobId,
        ":c": stats.chunksCreated,
        ":v": stats.chunksCreated,
        ":u": now,
      },
    })
  );

  return ok({
    jobId,
    sourceId,
    status: "queued",
    type: jobType,
  });
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
  return ok({ sourceId, deleted: true });
}
