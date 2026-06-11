import type { MessengerInboundMessage } from "../channels/types";

export function parseMessengerWebhookPayload(payload: unknown): MessengerInboundMessage[] {
  const root = payload as {
    object?: string;
    entry?: Array<{
      id?: string;
      messaging?: Array<{
        sender?: { id?: string };
        timestamp?: number;
        message?: {
          mid?: string;
          text?: string;
          is_echo?: boolean;
        };
        postback?: {
          mid?: string;
          payload?: string;
          title?: string;
        };
      }>;
    }>;
  };

  if (root.object !== "page" || !root.entry?.length) return [];

  const messages: MessengerInboundMessage[] = [];

  for (const entry of root.entry) {
    const pageId = entry.id;
    if (!pageId) continue;

    for (const event of entry.messaging ?? []) {
      if (event.message?.is_echo) continue;
      const from = event.sender?.id;
      if (!from) continue;

      const text = event.message?.text ?? event.postback?.title ?? event.postback?.payload;
      const messageId = event.message?.mid ?? event.postback?.mid;
      if (!text || !messageId) continue;

      messages.push({
        messageId,
        pageId,
        from,
        text,
        timestamp: event.timestamp
          ? new Date(event.timestamp).toISOString()
          : new Date().toISOString(),
      });
    }
  }

  return messages;
}
