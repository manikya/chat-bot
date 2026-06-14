import type { CoreConfig } from "../config";
import { resolveConversation } from "../chat/conversation";
import { stripMarkdown } from "../chat/text-format";
import { ensureFreshInstagramToken } from "../channels/instagram";
import { sendMessengerText } from "../channels/meta-client";
import {
  assertCanSendFreeFormMessage,
  MessagingWindowClosedError,
} from "../channels/messaging-policy";

import type { MetaOutboundOptions } from "./whatsapp-outbound";

export async function sendInstagramReply(
  tenantId: string,
  recipientId: string,
  text: string,
  config: CoreConfig,
  options?: MetaOutboundOptions
) {
  if (!options?.bypassMessagingWindow) {
    const conversation = await resolveConversation(tenantId, "instagram", recipientId, config);
    try {
      assertCanSendFreeFormMessage(conversation);
    } catch (err) {
      if (err instanceof MessagingWindowClosedError) {
        console.warn("[instagram] messaging window closed for", recipientId, "tenant", tenantId);
        return;
      }
      throw err;
    }
  }

  const creds = await ensureFreshInstagramToken(tenantId, config);
  if (!creds) throw new Error("Missing Instagram credentials for tenant");

  const plain = stripMarkdown(text);
  return sendMessengerText(config, creds.pageAccessToken, recipientId, plain);
}
