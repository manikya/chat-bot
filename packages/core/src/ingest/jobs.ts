import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes, generateId, type IngestJob, type IngestJobStatus } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import type { IngestJobStats } from "./types";

function toJob(item: Record<string, unknown>): IngestJob {
  return {
    jobId: item.jobId as string,
    sourceId: item.sourceId as string,
    type: item.type as string,
    status: item.status as string,
    stats: item.stats as IngestJob["stats"],
    startedAt: item.startedAt as string | undefined,
    completedAt: item.completedAt as string | undefined,
    error: item.error as string | undefined,
    createdAt: item.createdAt as string | undefined,
    progressPct: item.progressPct as number | undefined,
  };
}

export async function getJobItem(tenantId: string, jobId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.job(jobId) },
    })
  );
  if (!res.Item) {
    throw new ApiError(ErrorCodes.NOT_FOUND, "Job not found", 404);
  }
  return res.Item;
}

export async function createQueuedJob(
  tenantId: string,
  sourceId: string,
  jobType: string,
  config: CoreConfig
) {
  const jobId = generateId("job_");
  const now = new Date().toISOString();
  const item = {
    PK: Keys.tenantPk(tenantId),
    SK: Keys.job(jobId),
    jobId,
    sourceId,
    tenantId,
    type: jobType,
    status: "queued" as IngestJobStatus,
    stats: { pagesProcessed: 0, chunksCreated: 0, tokensEmbedded: 0, errors: [] },
    progressPct: 0,
    createdAt: now,
    GSI1PK: Keys.tenantPk(tenantId),
    GSI1SK: `JOB#${now}`,
  };
  const db = getDocClient(config);
  await db.send(new PutCommand({ TableName: config.tableName, Item: item }));
  return { jobId, item };
}

export async function updateJob(
  tenantId: string,
  jobId: string,
  patch: {
    status?: IngestJobStatus;
    stats?: IngestJobStats;
    progressPct?: number;
    error?: string | null;
    startedAt?: string;
    completedAt?: string;
  },
  config: CoreConfig
) {
  const sets: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  if (patch.status !== undefined) {
    sets.push("#status = :status");
    names["#status"] = "status";
    values[":status"] = patch.status;
  }
  if (patch.stats !== undefined) {
    sets.push("#stats = :stats");
    names["#stats"] = "stats";
    values[":stats"] = patch.stats;
  }
  if (patch.progressPct !== undefined) {
    sets.push("#progressPct = :progressPct");
    names["#progressPct"] = "progressPct";
    values[":progressPct"] = patch.progressPct;
  }
  if (patch.error !== undefined) {
    sets.push("#error = :error");
    names["#error"] = "error";
    values[":error"] = patch.error;
  }
  if (patch.startedAt !== undefined) {
    sets.push("#startedAt = :startedAt");
    names["#startedAt"] = "startedAt";
    values[":startedAt"] = patch.startedAt;
  }
  if (patch.completedAt !== undefined) {
    sets.push("#completedAt = :completedAt");
    names["#completedAt"] = "completedAt";
    values[":completedAt"] = patch.completedAt;
  }

  if (sets.length === 0) return;

  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.job(jobId) },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

const STALE_QUEUED_JOB_MS = 2 * 60 * 1000;

export async function hasActiveJobForSource(tenantId: string, sourceId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": "JOB#",
      },
    })
  );
  const now = Date.now();
  return (res.Items ?? []).some((item) => {
    if (item.sourceId !== sourceId) return false;
    if (item.status === "running") return true;
    if (item.status !== "queued") return false;
    const createdAt = item.createdAt as string | undefined;
    if (!createdAt) return true;
    return now - new Date(createdAt).getTime() < STALE_QUEUED_JOB_MS;
  });
}

export function jobToResponse(item: Record<string, unknown>): IngestJob {
  return toJob(item);
}
