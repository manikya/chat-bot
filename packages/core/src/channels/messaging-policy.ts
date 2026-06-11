import type { ConversationState } from "../chat/conversation";

/** Meta 24-hour customer care session window (WhatsApp + Messenger). */
export const MESSAGING_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export class MessagingWindowClosedError extends Error {
  readonly code = "MESSAGING_WINDOW_CLOSED";

  constructor(
    readonly channel: string,
    readonly externalUserId: string
  ) {
    super(
      `Cannot send free-form message on ${channel}: 24h session window expired for ${externalUserId}`
    );
    this.name = "MessagingWindowClosedError";
  }
}

export function canSendFreeFormMessage(
  conversation: Pick<ConversationState, "lastInboundAt">,
  atMs = Date.now()
): boolean {
  if (!conversation.lastInboundAt) return false;
  const lastInbound = Date.parse(conversation.lastInboundAt);
  if (Number.isNaN(lastInbound)) return false;
  return atMs - lastInbound < MESSAGING_SESSION_WINDOW_MS;
}

export function assertCanSendFreeFormMessage(
  conversation: Pick<ConversationState, "channel" | "externalUserId" | "lastInboundAt">,
  atMs = Date.now()
): void {
  if (!canSendFreeFormMessage(conversation, atMs)) {
    throw new MessagingWindowClosedError(conversation.channel, conversation.externalUserId);
  }
}
