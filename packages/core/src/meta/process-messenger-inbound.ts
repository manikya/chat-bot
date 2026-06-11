import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { runChatOrchestrator } from "../chat/orchestrator";
import { resolveTenantByPageId } from "../channels/service";
import type { MessengerInboundMessage } from "../channels/types";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { sendMessengerReply } from "./messenger-outbound";

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
          SK: Keys.idempotency(`msg_${messageId}`),
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

export async function processMessengerInbound(
  inbound: MessengerInboundMessage,
  config: CoreConfig
) {
  const tenantId = await resolveTenantByPageId(inbound.pageId, config);
  if (!tenantId) {
    console.warn("[messenger] no tenant for page_id", inbound.pageId);
    return;
  }

  const claimed = await claimIdempotency(tenantId, inbound.messageId, config);
  if (!claimed) {
    console.log("[messenger] duplicate message skipped", inbound.messageId);
    return;
  }

  const auth = {
    tenantId,
    userId: "messenger",
    role: "viewer" as const,
    email: "",
  };

  const result = await runChatOrchestrator(
    auth,
    {
      channel: "messenger",
      externalUserId: inbound.from,
      message: inbound.text,
    },
    config
  );

  await sendMessengerReply(tenantId, inbound.from, result.reply.content, config);

  console.log("[messenger] replied to", inbound.from, "tenant", tenantId);
}
