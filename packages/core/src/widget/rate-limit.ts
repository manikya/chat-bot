import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import type { TenantPlan } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { WIDGET_CHAT_RATE_LIMITS, WIDGET_CONFIG_RATE_LIMITS } from "../billing/plans";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { resolveTenantProfile } from "../tenant/status";

const WINDOW_SEC = 60;

async function bumpCounter(
  key: string,
  limit: number,
  config: CoreConfig
): Promise<void> {
  const db = getDocClient(config);
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - (nowSec % WINDOW_SEC);
  const ttl = windowStart + WINDOW_SEC * 2;

  try {
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk("SYSTEM"), SK: Keys.idempotency(`ratelimit_${key}_${windowStart}`) },
        UpdateExpression: "ADD requestCount :one SET #ttl = :ttl, updatedAt = :now",
        ConditionExpression: "attribute_not_exists(requestCount) OR requestCount < :limit",
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExpressionAttributeValues: {
          ":one": 1,
          ":limit": limit,
          ":ttl": ttl,
          ":now": new Date().toISOString(),
        },
      })
    );
  } catch (err) {
    const e = err as { name?: string };
    if (e.name === "ConditionalCheckFailedException") {
      throw new ApiError(ErrorCodes.RATE_LIMITED, "Too many requests. Please try again shortly.", 429);
    }
    throw err;
  }
}

async function widgetChatLimit(tenantId: string, config: CoreConfig) {
  const profile = await resolveTenantProfile(tenantId, config);
  const plan = (profile.plan as TenantPlan) ?? "trial";
  return WIDGET_CHAT_RATE_LIMITS[plan] ?? WIDGET_CHAT_RATE_LIMITS.trial;
}

async function widgetConfigLimit(tenantId: string, config: CoreConfig) {
  const profile = await resolveTenantProfile(tenantId, config);
  const plan = (profile.plan as TenantPlan) ?? "trial";
  return WIDGET_CONFIG_RATE_LIMITS[plan] ?? WIDGET_CONFIG_RATE_LIMITS.trial;
}

export async function assertWidgetChatRateLimit(
  tenantId: string,
  sessionId: string,
  config: CoreConfig
) {
  const limit = await widgetChatLimit(tenantId, config);
  await bumpCounter(`widget_chat_${tenantId}_${sessionId}`, limit, config);
}

export async function assertWidgetConfigRateLimit(tenantId: string, config: CoreConfig) {
  const limit = await widgetConfigLimit(tenantId, config);
  await bumpCounter(`widget_config_${tenantId}`, limit, config);
}
