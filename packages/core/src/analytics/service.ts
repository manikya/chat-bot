import { QueryCommand, type QueryCommandOutput } from "@aws-sdk/lib-dynamodb";
import { ok, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";

export interface AnalyticsQuery {
  from?: string;
  to?: string;
}

function parseDateInput(value: string | undefined, fallback: Date): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fallback.toISOString().slice(0, 10);
  }
  return value;
}

function dateRange(query: AnalyticsQuery) {
  const to = parseDateInput(query.to, new Date());
  const fromDefault = new Date();
  fromDefault.setUTCDate(fromDefault.getUTCDate() - 29);
  const from = parseDateInput(query.from, fromDefault);
  const fromIso = `${from}T00:00:00.000Z`;
  const toIso = `${to}T23:59:59.999Z`;
  return { from, to, fromIso, toIso };
}

function dayKeys(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T12:00:00.000Z`);
  const end = new Date(`${to}T12:00:00.000Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function inRange(iso: string | undefined, fromIso: string, toIso: string) {
  if (!iso) return false;
  return iso >= fromIso && iso <= toIso;
}

export async function getConversationAnalytics(
  auth: AuthContext,
  query: AnalyticsQuery,
  config: CoreConfig
) {
  const { from, to, fromIso, toIso } = dateRange(query);
  const db = getDocClient(config);
  const tenantPk = Keys.tenantPk(auth.tenantId);

  const messagesByDay = Object.fromEntries(dayKeys(from, to).map((d) => [d, 0]));
  const messagesByChannel: Record<string, number> = {};
  const intents: Record<string, number> = {};
  const subIntents: Record<string, number> = {};
  const funnelStages: Record<string, number> = {};
  const productSearches: Record<string, number> = {};

  let conversationsTotal = 0;
  let conversationsActive = 0;
  let cartsStarted = 0;
  let checkoutLinks = 0;

  let startKey: Record<string, unknown> | undefined;

  do {
    const res = await db.send(
      new QueryCommand({
        TableName: config.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { ":pk": tenantPk, ":sk": "CONV#" },
        ExclusiveStartKey: startKey,
      })
    );

    for (const item of res.Items ?? []) {
      const createdAt = item.createdAt as string | undefined;
      const updatedAt = item.updatedAt as string | undefined;
      if (!inRange(updatedAt ?? createdAt, fromIso, toIso)) continue;

      conversationsTotal += 1;
      if (item.status === "active") conversationsActive += 1;
    }

    startKey = res.LastEvaluatedKey;
  } while (startKey);

  startKey = undefined;
  do {
    const res: QueryCommandOutput = await db.send(
      new QueryCommand({
        TableName: config.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { ":pk": tenantPk, ":sk": "MSG#" },
        ExclusiveStartKey: startKey,
      })
    );

    for (const item of res.Items ?? []) {
      const createdAt = item.createdAt as string | undefined;
      if (!inRange(createdAt, fromIso, toIso)) continue;

      const day = createdAt!.slice(0, 10);
      if (day in messagesByDay) messagesByDay[day] += 1;

      const channel = (item.channel as string) ?? "unknown";
      messagesByChannel[channel] = (messagesByChannel[channel] ?? 0) + 1;

      const metadata = (item.metadata as Record<string, unknown> | undefined) ?? {};
      const intent = metadata.intent as string | undefined;
      if (intent) {
        intents[intent] = (intents[intent] ?? 0) + 1;
      }

      const funnelStage = metadata.funnelStage as string | undefined;
      if (funnelStage) {
        funnelStages[funnelStage] = (funnelStages[funnelStage] ?? 0) + 1;
      }

      const subIntent = metadata.subIntent as string | undefined;
      if (subIntent) {
        subIntents[subIntent] = (subIntents[subIntent] ?? 0) + 1;
      }

      const toolCalls = metadata.toolCalls as string[] | undefined;
      if (toolCalls?.includes("search_products")) {
        const snippet = String(item.content ?? "").slice(0, 80).toLowerCase();
        const key = snippet || "product search";
        productSearches[key] = (productSearches[key] ?? 0) + 1;
      }
      if (toolCalls?.includes("create_checkout_link")) {
        checkoutLinks += 1;
      }
    }

    startKey = res.LastEvaluatedKey;
  } while (startKey);

  startKey = undefined;
  do {
    const res: QueryCommandOutput = await db.send(
      new QueryCommand({
        TableName: config.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { ":pk": tenantPk, ":sk": "CART#" },
        ExclusiveStartKey: startKey,
      })
    );

    for (const item of res.Items ?? []) {
      const updatedAt = item.updatedAt as string | undefined;
      if (!inRange(updatedAt, fromIso, toIso)) continue;
      const items = item.items as unknown[] | undefined;
      if (items?.length) cartsStarted += 1;
    }

    startKey = res.LastEvaluatedKey;
  } while (startKey);

  const messagesTotal = Object.values(messagesByDay).reduce((a, b) => a + b, 0);

  return ok({
    from,
    to,
    summary: {
      messagesTotal,
      conversationsTotal,
      conversationsActive,
      cartsStarted,
      checkoutLinks,
    },
    messagesByDay: dayKeys(from, to).map((date) => ({
      date,
      messages: messagesByDay[date] ?? 0,
    })),
    channelBreakdown: Object.entries(messagesByChannel)
      .sort((a, b) => b[1] - a[1])
      .map(([channel, count]) => ({ channel, count })),
    intentBreakdown: Object.entries(intents)
      .sort((a, b) => b[1] - a[1])
      .map(([intent, count]) => ({ intent, count })),
    funnelStageBreakdown: Object.entries(funnelStages)
      .sort((a, b) => b[1] - a[1])
      .map(([stage, count]) => ({ stage, count })),
    subIntentBreakdown: Object.entries(subIntents)
      .sort((a, b) => b[1] - a[1])
      .map(([subIntent, count]) => ({ subIntent, count })),
    topProducts: Object.entries(productSearches)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count })),
    funnel: {
      conversations: conversationsTotal,
      withCart: cartsStarted,
      checkoutLinks,
    },
  });
}
