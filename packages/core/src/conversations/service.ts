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

const ABANDONED_CART_MS = 6 * 60 * 60 * 1000;

function isAbandonedCart(input: { lastInboundAt?: string; updatedAt: string }, cartUpdatedAt?: string) {
  const reference = input.lastInboundAt ?? cartUpdatedAt ?? input.updatedAt;
  const time = Date.parse(reference);
  if (!Number.isFinite(time)) return false;
  return Date.now() - time >= ABANDONED_CART_MS;
}

function cartSummary(
  conversation: { lastInboundAt?: string; updatedAt: string },
  cart: Awaited<ReturnType<typeof loadCart>>
) {
  if (!cart?.items.length) return undefined;
  return {
    itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: cart.subtotal,
    currency: cart.currency,
    updatedAt: cart.updatedAt,
    firstItemName: cart.items[0]?.name,
    abandoned: isAbandonedCart(conversation, cart.updatedAt),
    checkoutUrl: cart.checkoutUrl,
    checkoutProvider: cart.checkoutProvider,
    checkoutExternalId: cart.checkoutExternalId,
    checkoutCreatedAt: cart.checkoutCreatedAt,
  };
}

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
  const items = await Promise.all(
    data.items.map(async (conversation) => {
      const cart = await loadCart(auth.tenantId, conversation.conversationId, config);
      return {
        ...conversation,
        cart: cartSummary(conversation, cart),
      };
    })
  );
  return ok({ ...data, items });
}

export async function getConversationDetail(
  auth: AuthContext,
  conversationId: string,
  config: CoreConfig
) {
  const conv = await findConversationById(auth.tenantId, conversationId, config);
  if (!conv) throw new ApiError(ErrorCodes.NOT_FOUND, "Conversation not found", 404);

  const cart = await loadCart(auth.tenantId, conversationId, config);
  const summary = cartSummary(conv, cart);

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
      ? {
          itemCount: summary?.itemCount ?? cart.items.reduce((sum, item) => sum + item.quantity, 0),
          items: cart.items,
          subtotal: cart.subtotal,
          currency: cart.currency,
          updatedAt: cart.updatedAt,
          firstItemName: summary?.firstItemName,
          abandoned: summary?.abandoned ?? false,
          checkoutUrl: summary?.checkoutUrl,
          checkoutProvider: summary?.checkoutProvider,
          checkoutExternalId: summary?.checkoutExternalId,
          checkoutCreatedAt: summary?.checkoutCreatedAt,
        }
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
