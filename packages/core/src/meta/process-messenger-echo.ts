import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { resolveTenantByPageId } from "../channels/service";
import type { MessengerInboundMessage } from "../channels/types";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { captureMessengerEchoPair } from "../page-voice/service";

async function claimIdempotency(
  tenantId: string,
  messageId: string,
  config: CoreConfig
): Promise<boolean> {
  const db = getDocClient(config);
  const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  try {
    await db.send(
      new PutCommand({
        TableName: config.tableName,
        Item: {
          PK: Keys.tenantPk(tenantId),
          SK: Keys.idempotency(`echo_${messageId}`),
          createdAt: new Date().toISOString(),
          ttl,
        },
        ConditionExpression: "attribute_not_exists(SK)",
      })
    );
    return true;
  } catch (err) {
    const e = err as { name?: string };
    if (e.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

export async function processMessengerEcho(
  inbound: MessengerInboundMessage,
  config: CoreConfig
) {
  const tenantId = await resolveTenantByPageId(inbound.pageId, config);
  if (!tenantId) {
    console.warn("[page-voice] no tenant for page_id", inbound.pageId);
    return;
  }

  const claimed = await claimIdempotency(tenantId, inbound.messageId, config);
  if (!claimed) {
    console.log("[page-voice] duplicate echo skipped", inbound.messageId);
    return;
  }

  await captureMessengerEchoPair(tenantId, inbound, config);
}
