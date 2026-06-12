import type { CoreConfig } from "../config";
import { resolveConversation } from "../chat/conversation";
import { stripMarkdown } from "../chat/text-format";
import { ensureFreshMessengerToken } from "../channels/service";
import { sendMessengerText } from "../channels/meta-client";
import {
  assertCanSendFreeFormMessage,
  MessagingWindowClosedError,
} from "../channels/messaging-policy";

import type { MetaOutboundOptions } from "./whatsapp-outbound";

export async function sendMessengerReply(
  tenantId: string,
  recipientId: string,
  text: string,
  config: CoreConfig,
  options?: MetaOutboundOptions
) {
  if (!options?.bypassMessagingWindow) {
    const conversation = await resolveConversation(tenantId, "messenger", recipientId, config);
    try {
      assertCanSendFreeFormMessage(conversation);
    } catch (err) {
      if (err instanceof MessagingWindowClosedError) {
        console.warn("[messenger] messaging window closed for", recipientId, "tenant", tenantId);
        return;
      }
      throw err;
    }
  }

  const creds = await ensureFreshMessengerToken(tenantId, config);
  if (!creds) throw new Error("Missing Messenger credentials for tenant");

  return sendMessengerText(config, creds.pageAccessToken, recipientId, stripMarkdown(text));
}
