import type { ChatIntent } from "@commercechat/shared";

const FAQ_KEYWORDS = ["ship", "shipping", "return", "refund", "policy", "hours", "warranty", "exchange"];
const PRODUCT_KEYWORDS = ["buy", "price", "size", "color", "recommend", "product", "have", "stock", "cost"];
const CHECKOUT_KEYWORDS = ["cart", "checkout", "order", "pay", "purchase", "add to"];

const GREETING_PATTERN = /^(hi|hello|hey|howdy|good\s+(morning|afternoon|evening)|greetings)\b/i;

export function detectIntent(message: string, isFirstMessage: boolean): ChatIntent {
  const lower = message.toLowerCase();
  if (CHECKOUT_KEYWORDS.some((k) => lower.includes(k))) return "checkout";
  if (FAQ_KEYWORDS.some((k) => lower.includes(k))) return "faq";
  if (PRODUCT_KEYWORDS.some((k) => lower.includes(k))) return "product";
  if (isFirstMessage && GREETING_PATTERN.test(message.trim())) return "greeting";
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
