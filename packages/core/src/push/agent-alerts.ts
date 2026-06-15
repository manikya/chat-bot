import type { CoreConfig } from "../config";
import { deletePushDevice, listTenantPushTokens } from "../devices/service";
import { sendExpoPushMessages, type ExpoPushTicket } from "./expo";

export async function sendAgentPushAlerts(
  tenantId: string,
  input: {
    title: string;
    body: string;
    conversationId: string;
    channel: string;
  },
  config: CoreConfig
): Promise<{ sent: number; staleRemoved: number }> {
  const { tokens, keys } = await listTenantPushTokens(tenantId, config);
  if (!tokens.length) return { sent: 0, staleRemoved: 0 };

  const messages = tokens.map((to) => ({
    to,
    title: input.title,
    body: input.body,
    sound: "default" as const,
    priority: "high" as const,
    data: {
      conversationId: input.conversationId,
      channel: input.channel,
      type: "agent_inbound",
    },
  }));

  const tickets = await sendExpoPushMessages(messages);
  let sent = 0;
  let staleRemoved = 0;

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i] as ExpoPushTicket | undefined;
    const key = keys[i];
    if (!ticket || !key) continue;

    if (ticket.status === "ok") {
      sent += 1;
      continue;
    }

    const err = ticket.details?.error ?? ticket.message;
    if (err === "DeviceNotRegistered" || err === "InvalidCredentials") {
      await deletePushDevice(tenantId, key.userId, key.deviceKey, config);
      staleRemoved += 1;
    }
  }

  return { sent, staleRemoved };
}
