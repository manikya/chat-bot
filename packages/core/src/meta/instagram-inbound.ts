import type { InstagramInboundMessage } from "../channels/types";

export function parseInstagramWebhookPayload(payload: unknown): InstagramInboundMessage[] {
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

  if (root.object !== "instagram" || !root.entry?.length) return [];

  const messages: InstagramInboundMessage[] = [];

  for (const entry of root.entry) {
    const igUserId = entry.id;
    if (!igUserId) continue;

    for (const event of entry.messaging ?? []) {
      if (event.message?.is_echo) continue;

      const from = event.sender?.id;
      if (!from) continue;

      const text = event.message?.text ?? event.postback?.payload ?? event.postback?.title;
      const messageId = event.message?.mid ?? event.postback?.mid;
      if (!text || !messageId) continue;

      messages.push({
        messageId,
        igUserId,
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
