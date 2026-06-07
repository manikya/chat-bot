import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { ok, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getUsageForPeriod } from "../chat/usage";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

async function countMessagesToday(tenantId: string, config: CoreConfig): Promise<number> {
  const db = getDocClient(config);
  const today = todayUtc();
  let count = 0;
  let startKey: Record<string, unknown> | undefined;

  do {
    const res = await db.send(
      new QueryCommand({
        TableName: config.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": Keys.tenantPk(tenantId),
          ":sk": "MSG#",
        },
        ExclusiveStartKey: startKey,
        ProjectionExpression: "createdAt",
      })
    );
    for (const item of res.Items ?? []) {
      const createdAt = item.createdAt as string | undefined;
      if (createdAt?.startsWith(today)) count++;
    }
    startKey = res.LastEvaluatedKey;
  } while (startKey);

  return count;
}

async function countActiveConversations(tenantId: string, config: CoreConfig): Promise<number> {
  const db = getDocClient(config);
  const cutoff = daysAgoIso(7);
  let count = 0;
  let startKey: Record<string, unknown> | undefined;

  do {
    const res = await db.send(
      new QueryCommand({
        TableName: config.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": Keys.tenantPk(tenantId),
          ":sk": "CONV#",
        },
        ExclusiveStartKey: startKey,
      })
    );
    for (const item of res.Items ?? []) {
      if (item.status === "active" && (item.updatedAt as string) >= cutoff) {
        count++;
      }
    }
    startKey = res.LastEvaluatedKey;
  } while (startKey);

  return count;
}

async function countOrdersInfluenced(tenantId: string, config: CoreConfig): Promise<number> {
  const db = getDocClient(config);
  let count = 0;
  let startKey: Record<string, unknown> | undefined;

  do {
    const res = await db.send(
      new QueryCommand({
        TableName: config.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": Keys.tenantPk(tenantId),
          ":sk": "CART#",
        },
        ExclusiveStartKey: startKey,
        ProjectionExpression: "#items",
        ExpressionAttributeNames: { "#items": "items" },
      })
    );
    for (const item of res.Items ?? []) {
      const items = item.items as unknown[] | undefined;
      if (items?.length) count++;
    }
    startKey = res.LastEvaluatedKey;
  } while (startKey);

  return count;
}

async function resolveChannelHealth(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const channels = ["whatsapp", "messenger", "instagram", "web"] as const;
  const health: Record<string, string> = {
    whatsapp: "disconnected",
    messenger: "disconnected",
    instagram: "disconnected",
    web: "disconnected",
  };

  const [configRes, channelItems] = await Promise.all([
    db.send(
      new GetCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(tenantId), SK: Keys.config() },
      })
    ),
    Promise.all(
      channels.map((ch) =>
        db.send(
          new GetCommand({
            TableName: config.tableName,
            Key: { PK: Keys.tenantPk(tenantId), SK: `CHANNEL#${ch}` },
          })
        )
      )
    ),
  ]);

  const enabled = (configRes.Item?.enabledChannels as string[] | undefined) ?? [];
  if (enabled.includes("web")) health.web = "healthy";

  for (const res of channelItems) {
    const ch = (res.Item?.channel as string) ?? "";
    if (!res.Item) continue;
    if (res.Item.status === "connected") {
      health[ch] = "healthy";
    } else if (res.Item.status === "error") {
      health[ch] = "degraded";
    }
  }

  return health;
}

export async function getDashboardStats(auth: AuthContext, config: CoreConfig) {
  const period = currentPeriod();
  const db = getDocClient(config);

  const [usage, limitsRes, messagesToday, activeConversations, ordersInfluenced, channelHealth] =
    await Promise.all([
      getUsageForPeriod(auth.tenantId, period, config),
      db.send(
        new GetCommand({
          TableName: config.tableName,
          Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.limits() },
        })
      ),
      countMessagesToday(auth.tenantId, config),
      countActiveConversations(auth.tenantId, config),
      countOrdersInfluenced(auth.tenantId, config),
      resolveChannelHealth(auth.tenantId, config),
    ]);

  const maxMessages = Number(limitsRes.Item?.maxMessages ?? 2000);
  const quotaPercent =
    maxMessages > 0 ? Math.min(100, Math.round((usage.messages / maxMessages) * 100)) : 0;

  return ok({
    messagesToday,
    messagesThisMonth: usage.messages,
    activeConversations,
    ordersInfluenced,
    channelHealth,
    quotaPercent,
  });
}
