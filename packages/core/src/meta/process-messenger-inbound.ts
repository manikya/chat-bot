import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { runChatOrchestrator } from "../chat/orchestrator";
import { isPlanLimitError, QUOTA_EXCEEDED_USER_MESSAGE } from "../chat/usage";
import { isTenantInactiveError, TENANT_SUSPENDED_MESSAGE } from "../tenant/status";
import { resolveTenantByPageId } from "../channels/service";
import type { MessengerInboundMessage } from "../channels/types";
import { ensureFreshMessengerToken } from "../channels/service";
import { sendMessengerGenericTemplate } from "../channels/meta-client";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { sendMessengerReply } from "./messenger-outbound";
import { syncMessengerCustomerProfile } from "./messenger-profile";
import { setPendingCustomerMessage } from "../page-voice/service";
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

  try {
    await syncMessengerCustomerProfile(tenantId, inbound.from, config);
  } catch (err) {
    console.warn(
      "[messenger] profile sync error:",
      err instanceof Error ? err.message : err
    );
  }

  const auth = {
    tenantId,
    userId: "messenger",
    role: "viewer" as const,
    email: "",
  };

  await setPendingCustomerMessage(tenantId, inbound.from, inbound.text, inbound.messageId, config);

  try {
    const result = await runChatOrchestrator(
      auth,
      {
        channel: "messenger",
        externalUserId: inbound.from,
        message: inbound.text,
      },
      config
    );

    if (result.handledBy === "human") {
      console.log("[messenger] human handling — no bot reply for", inbound.from);
      return;
    }

    const productElements = buildMessengerProductElements(result);
    if (productElements.length) {
      await sendMessengerReply(tenantId, inbound.from, result.reply.content, config);
      const creds = await ensureFreshMessengerToken(tenantId, config);
      if (!creds) throw new Error("Missing Messenger credentials for tenant");
      try {
        await sendMessengerGenericTemplate(
          config,
          creds.pageAccessToken,
          inbound.from,
          productElements
        );
      } catch (sendErr) {
        console.warn("[messenger] product cards failed; sending text fallback", sendErr);
        await sendMessengerReply(
          tenantId,
          inbound.from,
          formatProductCardsForChannel(result, "messenger"),
          config
        );
      }
    } else {
      await sendMessengerReply(tenantId, inbound.from, result.reply.content, config);
    }

    console.log("[messenger] replied to", inbound.from, "tenant", tenantId);
  } catch (err) {
    if (isPlanLimitError(err) || isTenantInactiveError(err)) {
      await sendMessengerReply(
        tenantId,
        inbound.from,
        isTenantInactiveError(err) ? TENANT_SUSPENDED_MESSAGE : QUOTA_EXCEEDED_USER_MESSAGE,
        config,
        { bypassMessagingWindow: true }
      ).catch((sendErr) => console.warn("[messenger] quota notice failed", sendErr));
      console.log("[messenger] quota exceeded for tenant", tenantId);
      return;
    }
    throw err;
  }
}
