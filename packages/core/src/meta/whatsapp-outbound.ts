import type { CoreConfig } from "../config";
import { resolveConversation } from "../chat/conversation";
import { ensureFreshMetaToken } from "../channels/service";
import { sendWhatsAppText } from "../channels/meta-client";
import {
  assertCanSendFreeFormMessage,
  MessagingWindowClosedError,
} from "../channels/messaging-policy";

export interface MetaOutboundOptions {
  bypassMessagingWindow?: boolean;
}

export async function sendWhatsAppReply(
  tenantId: string,
  phoneNumberId: string,
  to: string,
  text: string,
  config: CoreConfig,
  options?: MetaOutboundOptions
) {
  if (!options?.bypassMessagingWindow) {
    const conversation = await resolveConversation(tenantId, "whatsapp", to, config);
    try {
      assertCanSendFreeFormMessage(conversation);
    } catch (err) {
      if (err instanceof MessagingWindowClosedError) {
        console.warn("[whatsapp] messaging window closed for", to, "tenant", tenantId);
        return;
      }
      throw err;
    }
  }

  const creds = await ensureFreshMetaToken(tenantId, config);
  if (!creds) throw new Error("Missing Meta credentials for tenant");

  return sendWhatsAppText(config, phoneNumberId, creds.accessToken, to, text);
}
