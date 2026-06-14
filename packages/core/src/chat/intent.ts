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

export function ragSourceTypesForIntent(intent: ChatIntent): string[] {
  switch (intent) {
    case "faq":
      return ["website", "faq"];
    case "product":
      return ["catalog", "website"];
    case "checkout":
      return ["catalog", "website"];
    default:
      return ["website", "catalog"];
  }
}
