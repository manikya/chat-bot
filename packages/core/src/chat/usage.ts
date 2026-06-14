import { UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes, ok, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";

export const QUOTA_EXCEEDED_USER_MESSAGE =
  "Sorry, this store has reached its monthly message limit. Please try again later or contact the store directly.";

export function isPlanLimitError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === ErrorCodes.PLAN_LIMIT_EXCEEDED;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isValidPeriod(period: string) {
  return /^\d{4}-\d{2}$/.test(period);
}

function estimateLlmCostUsd(inputTokens: number, outputTokens: number) {
  // gpt-4o-mini list pricing: $0.15/1M in, $0.60/1M out
  return (inputTokens * 0.15 + outputTokens * 0.6) / 1_000_000;
}

export async function getUsageForPeriod(tenantId: string, period: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.usage(period) },
    })
  );
  if (!res.Item) {
    return { period, messages: 0, inputTokens: 0, outputTokens: 0, ingestJobs: 0 };
  }
  return {
    period,
    messages: Number(res.Item.messages ?? 0),
    inputTokens: Number(res.Item.inputTokens ?? 0),
    outputTokens: Number(res.Item.outputTokens ?? 0),
    ingestJobs: Number(res.Item.ingestJobs ?? 0),
  };
}

export async function getMonthlyUsage(tenantId: string, config: CoreConfig) {
  return getUsageForPeriod(tenantId, currentPeriod(), config);
}

export async function getTenantUsage(auth: AuthContext, periodInput: string | undefined, config: CoreConfig) {
  const period = periodInput && isValidPeriod(periodInput) ? periodInput : currentPeriod();
  const db = getDocClient(config);
  const [usage, limitsRes] = await Promise.all([
    getUsageForPeriod(auth.tenantId, period, config),
    db.send(
      new GetCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.limits() },
      })
    ),
  ]);
  const maxMessages = Number(limitsRes.Item?.maxMessages ?? 2000);
  const messagesRemaining = Math.max(0, maxMessages - usage.messages);

  return ok({
    period: usage.period,
    messages: usage.messages,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    ingestJobs: usage.ingestJobs,
    estimatedLlmCostUsd: Number(estimateLlmCostUsd(usage.inputTokens, usage.outputTokens).toFixed(4)),
    limits: { maxMessages, messagesRemaining },
  });
}

export async function incrementUsage(
  tenantId: string,
  config: CoreConfig,
  delta: { messages?: number; inputTokens?: number; outputTokens?: number }
) {
  const period = currentPeriod();
  const now = new Date().toISOString();
  const db = getDocClient(config);

  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.usage(period) },
      UpdateExpression:
        "SET #period = if_not_exists(#period, :period), #updatedAt = :u ADD #messages :m, #inputTokens :i, #outputTokens :o",
      ExpressionAttributeNames: {
        "#period": "period",
        "#updatedAt": "updatedAt",
        "#messages": "messages",
        "#inputTokens": "inputTokens",
        "#outputTokens": "outputTokens",
      },
      ExpressionAttributeValues: {
        ":period": period,
        ":u": now,
        ":m": delta.messages ?? 0,
        ":i": delta.inputTokens ?? 0,
        ":o": delta.outputTokens ?? 0,
      },
    })
  );
}

export async function incrementIngestJobs(tenantId: string, config: CoreConfig) {
  const period = currentPeriod();
  const now = new Date().toISOString();
  const db = getDocClient(config);

  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.usage(period) },
      UpdateExpression:
        "SET #period = if_not_exists(#period, :period), #updatedAt = :u ADD #ingestJobs :one",
      ExpressionAttributeNames: {
        "#period": "period",
        "#updatedAt": "updatedAt",
        "#ingestJobs": "ingestJobs",
      },
      ExpressionAttributeValues: {
        ":period": period,
        ":u": now,
        ":one": 1,
      },
    })
  );
}

export async function checkMessageQuota(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const [usage, limitsRes] = await Promise.all([
    getMonthlyUsage(tenantId, config),
    db.send(
      new GetCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(tenantId), SK: Keys.limits() },
      })
    ),
  ]);
  const maxMessages = Number(limitsRes.Item?.maxMessages ?? 2000);
  if (usage.messages >= maxMessages) {
    return { allowed: false as const, usage, maxMessages };
  }
  return { allowed: true as const, usage, maxMessages };
}

/** Atomically reserve one message against the tenant's monthly cap before LLM work runs. */
export async function reserveMessageQuota(tenantId: string, config: CoreConfig) {
  const period = currentPeriod();
  const now = new Date().toISOString();
  const db = getDocClient(config);

  const limitsRes = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.limits() },
    })
  );
  const maxMessages = Number(limitsRes.Item?.maxMessages ?? 2000);

  try {
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(tenantId), SK: Keys.usage(period) },
        UpdateExpression:
          "SET #period = if_not_exists(#period, :period), #updatedAt = :u ADD #messages :one",
        ConditionExpression: "attribute_not_exists(#messages) OR #messages < :max",
        ExpressionAttributeNames: {
          "#period": "period",
          "#updatedAt": "updatedAt",
          "#messages": "messages",
        },
        ExpressionAttributeValues: {
          ":period": period,
          ":u": now,
          ":one": 1,
          ":max": maxMessages,
        },
      })
    );
  } catch (err) {
    const e = err as { name?: string };
    if (e.name === "ConditionalCheckFailedException") {
      throw new ApiError(
        ErrorCodes.PLAN_LIMIT_EXCEEDED,
        `Monthly message limit reached (${maxMessages})`,
        429
      );
    }
    throw err;
  }
}

export async function assertChannelEnabled(tenantId: string, channel: string, config: CoreConfig) {
  const db = getDocClient(config);
  const limitsRes = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.limits() },
    })
  );
  const enabled = (limitsRes.Item?.enabledChannels as string[] | undefined) ?? [
    "web",
    "whatsapp",
    "messenger",
    "instagram",
  ];
  if (enabled.includes(channel)) return;
  // Onboarding simulator and admin test chat — not a billable customer channel.
  if (channel === "test") return;

  // Limits row may predate a channel the merchant already connected.
  if (channel === "whatsapp" || channel === "messenger" || channel === "instagram") {
    const channelRes = await db.send(
      new GetCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(tenantId), SK: Keys.channel(channel) },
      })
    );
    if (channelRes.Item?.status === "connected") return;
  }

  throw new ApiError(
    ErrorCodes.PLAN_LIMIT_EXCEEDED,
    `Channel "${channel}" is not enabled on your plan`,
    403
  );
}
