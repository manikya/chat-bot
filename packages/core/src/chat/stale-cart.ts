import type { AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getProductBySku } from "../catalog/products";
import type { CartState } from "./cart";
import { clearCart, removeCartItems } from "./cart";
import type { ConversationState } from "./conversation";
import { formatMoney } from "./locale";
import { addWishlistReminder } from "./wishlist";

const STALE_CART_MS = 6 * 60 * 60 * 1000;

function elapsedSinceConversation(conversation: ConversationState): number {
  const last = conversation.lastInboundAt ?? conversation.updatedAt ?? conversation.createdAt;
  const time = Date.parse(last);
  if (!Number.isFinite(time)) return 0;
  return Date.now() - time;
}

export function hasStaleCartContext(conversation: ConversationState, cart: CartState | null): boolean {
  return Boolean(cart?.items.length) && elapsedSinceConversation(conversation) >= STALE_CART_MS;
}

function normalize(message: string): string {
  let output = "";
  let previousWasSpace = true;
  for (const char of message.toLowerCase()) {
    const code = char.charCodeAt(0);
    const isWordChar = (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
    if (isWordChar) {
      output += char;
      previousWasSpace = false;
    } else if (!previousWasSpace) {
      output += " ";
      previousWasSpace = true;
    }
  }
  return output.trim();
}

function includesAnyPhrase(message: string, phrases: string[]): boolean {
  const normalized = ` ${normalize(message)} `;
  return phrases.some((phrase) => normalized.includes(` ${normalize(phrase)} `));
}

export function isCartAbandonmentReply(message: string): boolean {
  return includesAnyPhrase(message, ["no", "nope", "cancel", "clear", "remove", "dont need", "don t need", "not now", "not anymore", "changed my mind"]);
}

export function isCartContinuationReply(message: string): boolean {
  return includesAnyPhrase(message, ["yes", "yeah", "yep", "still", "continue", "checkout", "buy", "interested", "keep", "want it", "need it"]);
}

export function shouldPauseForStaleCart(message: string, conversation: ConversationState, cart: CartState | null) {
  if (!hasStaleCartContext(conversation, cart)) return false;
  if (isCartAbandonmentReply(message) || isCartContinuationReply(message)) return true;
  return includesAnyPhrase(message, ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"]);
}

function cartSummary(cart: CartState): string {
  const first = cart.items[0]!;
  const more = cart.items.length > 1 ? ` +${cart.items.length - 1} more` : "";
  return `${first.name}${more}`;
}

export async function handleStaleCartMessage(input: {
  auth: AuthContext;
  conversation: ConversationState;
  cart: CartState;
  message: string;
  config: CoreConfig;
}): Promise<{ handled: boolean; reply?: string; cart?: CartState | null }> {
  const { auth, conversation, cart, message, config } = input;

  if (isCartAbandonmentReply(message)) {
    const cleared = await clearCart(auth.tenantId, conversation.conversationId, config);
    return {
      handled: true,
      reply: "No problem, I cleared your cart. What are you looking for today?",
      cart: cleared,
    };
  }

  if (!isCartContinuationReply(message)) {
    return {
      handled: true,
      reply: `Welcome back. Are you still looking for ${cartSummary(cart)}, or should I clear your cart?`,
      cart,
    };
  }

  const products = await Promise.all(
    cart.items.map(async (item) => ({
      item,
      product: await getProductBySku(auth.tenantId, item.sku, config),
    }))
  );
  const outOfStock = products.filter(({ product }) => product?.inStock === false);
  if (!outOfStock.length) {
    return {
      handled: true,
      reply: `Great, ${cartSummary(cart)} is still in your cart (${formatMoney(cart.subtotal, cart.currency)}). Ready to checkout?`,
      cart,
    };
  }

  await Promise.all(
    outOfStock.map(({ item, product }) =>
      addWishlistReminder(
        {
          tenantId: auth.tenantId,
          conversationId: conversation.conversationId,
          channel: conversation.channel,
          externalUserId: conversation.externalUserId,
          sku: item.sku,
          productName: product?.name ?? item.name,
        },
        config
      )
    )
  );
  const nextCart = await removeCartItems(
    auth.tenantId,
    conversation.conversationId,
    outOfStock.map(({ item }) => item.sku),
    config
  );
  const names = outOfStock.map(({ product, item }) => product?.name ?? item.name).join(", ");
  const verb = outOfStock.length === 1 ? "is" : "are";
  const remaining = nextCart?.items.length
    ? ` The rest is still in your cart.`
    : " I cleared those items from your cart.";
  return {
    handled: true,
    reply: `${names} ${verb} out of stock, so I added ${outOfStock.length === 1 ? "it" : "them"} to your reminder list.${remaining}`,
    cart: nextCart,
  };
}
