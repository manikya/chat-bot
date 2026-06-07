import { UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getMonthlyUsage(tenantId: string, config: CoreConfig) {
  const period = currentPeriod();
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.usage(period) },
    })
  );
  if (!res.Item) {
    return { period, messages: 0, inputTokens: 0, outputTokens: 0 };
  }
  return {
    period,
    messages: Number(res.Item.messages ?? 0),
    inputTokens: Number(res.Item.inputTokens ?? 0),
    outputTokens: Number(res.Item.outputTokens ?? 0),
  };
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
