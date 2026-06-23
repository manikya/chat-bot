import type { ChatIntent, ChatSubIntent, FunnelStage } from "@commercechat/shared";
import {
  LK_CHECKOUT_KEYWORDS,
  LK_FAQ_KEYWORDS,
  LK_GREETING_PATTERN,
  LK_PRODUCT_KEYWORDS,
} from "./locale";
import { messageSignalsCompare, messageSignalsObjection } from "./funnel";

const FAQ_KEYWORDS = LK_FAQ_KEYWORDS;
const PRODUCT_KEYWORDS = LK_PRODUCT_KEYWORDS;
const CHECKOUT_KEYWORDS = LK_CHECKOUT_KEYWORDS;

const SHOPPING_INTENT_PATTERNS = [
  /\b(looking for|lookin for|need|want|shopping for|finding|find me)\b/i,
  /\b(gift|gifts|gift ideas?|father'?s day|mother'?s day|birthday|anniversary|wedding|housewarming)\b/i,
  /\b(best\s*-?\s*sellers?|top picks?|popular|trending|recommend|suggest|show me|show us)\b/i,
  /\b(suitable|good|ideal|perfect)\s+for\b/i,
  /\b(corporate|cooperate|event|giveaways?|table decor|awards?|appreciation)\b/i,
  /\b(under|below|less than|max|within|budget|upto|up to)\s*(?:rs\.?|lkr|\$|usd)?\s*[\d,]+/i,
];

export function messageSignalsShoppingIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return PRODUCT_KEYWORDS.some((k) => lower.includes(k)) || SHOPPING_INTENT_PATTERNS.some((p) => p.test(message));
}

/** Short opener with no shopping ask — works on any turn, not only the first message. */
export function isGreetingOnlyMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!LK_GREETING_PATTERN.test(trimmed)) return false;
  if (messageSignalsShoppingIntent(trimmed)) return false;
  if (
    /\b(do you have|show me|looking for|i want|i need|how much|price|order|ship|deliver|return|gift for)\b/i.test(
      trimmed
    )
  ) {
    return false;
  }
  return trimmed.split(/\s+/).length <= 10;
}

export function detectIntent(message: string, isFirstMessage: boolean): ChatIntent {
  const lower = message.toLowerCase();
  if (CHECKOUT_KEYWORDS.some((k) => lower.includes(k))) return "checkout";
  if (FAQ_KEYWORDS.some((k) => lower.includes(k))) return "faq";
  if (messageSignalsShoppingIntent(message)) return "product";
  if (isGreetingOnlyMessage(message)) return "greeting";
  if (isFirstMessage) return "unknown";
  return "product";
}

export function messageMentionsProducts(message: string): boolean {
  return messageSignalsShoppingIntent(message);
}

export function detectSubIntent(
  message: string,
  intent: ChatIntent,
  funnelStage: FunnelStage
): ChatSubIntent {
  const lower = message.toLowerCase();

  if (/\b(order\s*#?\s*\w+|track\s+(my\s+)?order|where is my order|order status)\b/i.test(message)) {
    return "order_status";
  }

  if (intent === "checkout" || funnelStage === "checkout") {
    return "checkout_ready";
  }

  if (funnelStage === "cart" || /\b(my cart|what'?s in my cart|cart items)\b/i.test(lower)) {
    return "cart_review";
  }

  if (intent === "faq") {
    if (funnelStage === "objection" || messageSignalsObjection(message)) {
      return "faq_objection";
    }
    return "faq_policy";
  }

  if (intent === "greeting") {
    return messageMentionsProducts(message) ? "product_browse" : "faq_policy";
  }

  if (intent === "product" || messageMentionsProducts(message)) {
    if (messageSignalsCompare(message)) {
      return "product_compare";
    }
    if (/\b(sku|details|tell me more|specs?|specification)\b/i.test(message)) {
      return "product_detail";
    }
    return "product_browse";
  }

  return "product_browse";
}

export function ragSourceTypesForIntent(
  intent: ChatIntent,
  message?: string,
  subIntent?: ChatSubIntent
): string[] {
  const wantsProducts = messageMentionsProducts(message ?? "");
  if (subIntent === "faq_objection") {
    return wantsProducts
      ? ["faq", "website", "catalog", "conversation"]
      : ["faq", "website", "conversation"];
  }
  switch (intent) {
    case "faq":
      return wantsProducts
        ? ["website", "faq", "catalog", "conversation"]
        : ["website", "faq", "conversation"];
    case "greeting":
      return wantsProducts ? ["website", "catalog", "conversation"] : ["website", "conversation"];
    case "unknown":
      return wantsProducts
        ? ["website", "faq", "catalog", "conversation"]
        : ["website", "faq", "conversation"];
    case "product":
      return ["catalog", "website", "conversation"];
    case "checkout":
      return ["catalog", "website"];
    default:
      return ["website", "catalog", "conversation"];
  }
}
