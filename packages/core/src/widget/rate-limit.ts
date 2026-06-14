import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";

const WINDOW_SEC = 60;
const MAX_CHAT_REQUESTS = 30;
const MAX_CONFIG_REQUESTS = 120;

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

export async function assertWidgetChatRateLimit(
  tenantId: string,
  sessionId: string,
  config: CoreConfig
) {
  await bumpCounter(`widget_chat_${tenantId}_${sessionId}`, MAX_CHAT_REQUESTS, config);
}

export async function assertWidgetConfigRateLimit(tenantId: string, config: CoreConfig) {
  await bumpCounter(`widget_config_${tenantId}`, MAX_CONFIG_REQUESTS, config);
}
