import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { runChatOrchestrator } from "../chat/orchestrator";
import { isPlanLimitError, QUOTA_EXCEEDED_USER_MESSAGE } from "../chat/usage";
import { isTenantInactiveError, TENANT_SUSPENDED_MESSAGE } from "../tenant/status";
import {
  ensureFreshMetaToken,
  resolveTenantByPhoneNumberId,
} from "../channels/service";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import type { WhatsAppInboundMessage } from "../channels/types";
import { formatProductCardsForChannel } from "./product-cards";
import { sendWhatsAppReply } from "./whatsapp-outbound";

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
          SK: Keys.idempotency(`wa_${messageId}`),
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

export async function processWhatsAppInbound(
  inbound: WhatsAppInboundMessage,
  config: CoreConfig
) {
  const tenantId = await resolveTenantByPhoneNumberId(inbound.phoneNumberId, config);
  if (!tenantId) {
    console.warn("[whatsapp] no tenant for phone_number_id", inbound.phoneNumberId);
    return;
  }

  const creds = await ensureFreshMetaToken(tenantId, config);
  if (!creds) {
    console.warn("[whatsapp] no credentials for tenant", tenantId);
    return;
  }

  const claimed = await claimIdempotency(tenantId, inbound.messageId, config);
  if (!claimed) {
    console.log("[whatsapp] duplicate message skipped", inbound.messageId);
    return;
  }

  const auth = {
    tenantId,
    userId: "whatsapp",
    role: "viewer" as const,
    email: "",
  };

  try {
    const result = await runChatOrchestrator(
      auth,
      {
        channel: "whatsapp",
        externalUserId: inbound.from,
        message: inbound.text,
      },
      config
    );

    if (result.handledBy === "human") {
      console.log("[whatsapp] human handling — no bot reply for", inbound.from);
      return;
    }

    await sendWhatsAppReply(
      tenantId,
      inbound.phoneNumberId,
      inbound.from,
      formatProductCardsForChannel(result, "whatsapp"),
      config
    );

    console.log("[whatsapp] replied to", inbound.from, "tenant", tenantId);
  } catch (err) {
    if (isPlanLimitError(err) || isTenantInactiveError(err)) {
      await sendWhatsAppReply(
        tenantId,
        inbound.phoneNumberId,
        inbound.from,
        isTenantInactiveError(err) ? TENANT_SUSPENDED_MESSAGE : QUOTA_EXCEEDED_USER_MESSAGE,
        config,
        { bypassMessagingWindow: true }
      ).catch((sendErr) => console.warn("[whatsapp] quota notice failed", sendErr));
      console.log("[whatsapp] quota exceeded for tenant", tenantId);
      return;
    }
    throw err;
  }
}
