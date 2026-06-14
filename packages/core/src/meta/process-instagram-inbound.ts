import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { runChatOrchestrator } from "../chat/orchestrator";
import { isPlanLimitError, QUOTA_EXCEEDED_USER_MESSAGE } from "../chat/usage";
import { resolveTenantByIgUserId } from "../channels/instagram";
import type { InstagramInboundMessage } from "../channels/types";
import { ensureFreshInstagramToken } from "../channels/instagram";
import { sendMessengerGenericTemplate } from "../channels/meta-client";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { sendInstagramReply } from "./instagram-outbound";
import {
  buildMessengerProductElements,
  formatProductCardsForChannel,
} from "./product-cards";

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

export async function processInstagramInbound(
  inbound: InstagramInboundMessage,
  config: CoreConfig
) {
  const tenantId = await resolveTenantByIgUserId(inbound.igUserId, config);
  if (!tenantId) {
    console.warn("[instagram] no tenant for ig_user_id", inbound.igUserId);
    return;
  }

  const claimed = await claimIdempotency(tenantId, inbound.messageId, config);
  if (!claimed) {
    console.log("[instagram] duplicate message skipped", inbound.messageId);
    return;
  }

  const auth = {
    tenantId,
    userId: "instagram",
    role: "viewer" as const,
    email: "",
  };

  try {
    const result = await runChatOrchestrator(
      auth,
      {
        channel: "instagram",
        externalUserId: inbound.from,
        message: inbound.text,
      },
      config
    );

    const productElements = buildMessengerProductElements(result);
    if (productElements.length) {
      await sendInstagramReply(tenantId, inbound.from, result.reply.content, config);
      const creds = await ensureFreshInstagramToken(tenantId, config);
      if (!creds) throw new Error("Missing Instagram credentials for tenant");
      try {
        await sendMessengerGenericTemplate(
          config,
          creds.pageAccessToken,
          inbound.from,
          productElements
        );
      } catch (sendErr) {
        console.warn("[instagram] product cards failed; sending text fallback", sendErr);
        await sendInstagramReply(
          tenantId,
          inbound.from,
          formatProductCardsForChannel(result, "messenger"),
          config
        );
      }
    } else {
      await sendInstagramReply(tenantId, inbound.from, result.reply.content, config);
    }

    console.log("[instagram] replied to", inbound.from, "tenant", tenantId);
  } catch (err) {
    if (isPlanLimitError(err)) {
      await sendInstagramReply(
        tenantId,
        inbound.from,
        QUOTA_EXCEEDED_USER_MESSAGE,
        config,
        { bypassMessagingWindow: true }
      ).catch((sendErr) => console.warn("[instagram] quota notice failed", sendErr));
      console.log("[instagram] quota exceeded for tenant", tenantId);
      return;
    }
    throw err;
  }
}
