import type { WhatsAppInboundMessage } from "../channels/types";

export function parseWhatsAppWebhookPayload(payload: unknown): WhatsAppInboundMessage[] {
  const root = payload as {
    object?: string;
    entry?: Array<{
      id?: string;
      changes?: Array<{
        field?: string;
        value?: {
          metadata?: { phone_number_id?: string };
          messages?: Array<{
            id?: string;
            from?: string;
            timestamp?: string;
            type?: string;
            text?: { body?: string };
          }>;
        };
      }>;
    }>;
  };

  if (root.object !== "whatsapp_business_account" || !root.entry?.length) return [];

  const messages: WhatsAppInboundMessage[] = [];

  for (const entry of root.entry) {
    const wabaId = entry.id;
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      for (const msg of value?.messages ?? []) {
        if (msg.type !== "text" || !msg.text?.body || !msg.from || !msg.id) continue;
        messages.push({
          messageId: msg.id,
          phoneNumberId,
          wabaId,
          from: msg.from,
          text: msg.text.body,
          timestamp: msg.timestamp
            ? new Date(Number(msg.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
        });
      }
    }
  }

  return messages;
}
