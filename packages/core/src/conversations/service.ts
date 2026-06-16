import { ApiError, ErrorCodes, ok, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { loadCart } from "../chat/cart";
import {
  customerDisplayName,
  findConversationById,
  listConversationMessages,
  listTenantConversations,
} from "../chat/conversation";
import { conversationHandlingDto } from "../chat/handling";

export async function listConversations(
  auth: AuthContext,
  query: {
    channel?: string;
    status?: string;
    handlingMode?: "bot" | "human";
    limit?: number;
    cursor?: string;
  },
  config: CoreConfig
) {
  const data = await listTenantConversations(auth.tenantId, config, query);
  return ok(data);
}

export async function getConversationDetail(
  auth: AuthContext,
  conversationId: string,
  config: CoreConfig
) {
  const conv = await findConversationById(auth.tenantId, conversationId, config);
  if (!conv) throw new ApiError(ErrorCodes.NOT_FOUND, "Conversation not found", 404);

  const cart = await loadCart(auth.tenantId, conversationId, config);

  return ok({
    conversationId: conv.conversationId,
    channel: conv.channel,
    externalUserId: conv.externalUserId,
    customerName: customerDisplayName(conv),
    status: conv.status,
    messageCount: conv.messageCount,
    lastInboundAt: conv.lastInboundAt ?? conv.createdAt,
    updatedAt: conv.updatedAt,
    ...conversationHandlingDto(conv),
    funnelStage: conv.funnelStage ?? "discover",
    lastIntent: conv.lastIntent,
    lastSubIntent: conv.lastSubIntent,
    qualification: conv.qualification ?? undefined,
    cart: cart?.items.length
      ? { items: cart.items, subtotal: cart.subtotal, currency: cart.currency }
      : undefined,
  });
}

export async function getConversationMessages(
  auth: AuthContext,
  conversationId: string,
  query: { limit?: number; order?: "asc" | "desc" },
  config: CoreConfig
) {
  const conv = await findConversationById(auth.tenantId, conversationId, config);
  if (!conv) throw new ApiError(ErrorCodes.NOT_FOUND, "Conversation not found", 404);

  const data = await listConversationMessages(auth.tenantId, conversationId, config, query);
  return ok(data);
}
