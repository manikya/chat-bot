import type { ChatIntent } from "@commercechat/shared";
import {
  LK_CHECKOUT_KEYWORDS,
  LK_FAQ_KEYWORDS,
  LK_GREETING_PATTERN,
  LK_PRODUCT_KEYWORDS,
} from "./locale";

const FAQ_KEYWORDS = LK_FAQ_KEYWORDS;
const PRODUCT_KEYWORDS = LK_PRODUCT_KEYWORDS;
const CHECKOUT_KEYWORDS = LK_CHECKOUT_KEYWORDS;

export function detectIntent(message: string, isFirstMessage: boolean): ChatIntent {
  const lower = message.toLowerCase();
  if (CHECKOUT_KEYWORDS.some((k) => lower.includes(k))) return "checkout";
  if (FAQ_KEYWORDS.some((k) => lower.includes(k))) return "faq";
  if (PRODUCT_KEYWORDS.some((k) => lower.includes(k))) return "product";
  if (isFirstMessage && LK_GREETING_PATTERN.test(message.trim())) return "greeting";
  if (isFirstMessage) return "unknown";
  return "product";
}

export function messageMentionsProducts(message: string): boolean {
  const lower = message.toLowerCase();
  return PRODUCT_KEYWORDS.some((k) => lower.includes(k));
}

export function ragSourceTypesForIntent(intent: ChatIntent, message?: string): string[] {
  const wantsProducts = messageMentionsProducts(message ?? "");
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
