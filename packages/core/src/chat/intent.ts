import type { ChatIntent, ChatSubIntent, FunnelStage } from "@commercechat/shared";
import {
  LK_CHECKOUT_KEYWORDS,
  LK_FAQ_KEYWORDS,
  LK_PRODUCT_KEYWORDS,
} from "./locale";

const FAQ_KEYWORDS = LK_FAQ_KEYWORDS;
const PRODUCT_KEYWORDS = LK_PRODUCT_KEYWORDS;
const CHECKOUT_KEYWORDS = LK_CHECKOUT_KEYWORDS;
const GREETING_ONLY_MESSAGES = new Set([
  "hi",
  "hello",
  "hey",
  "halo",
  "howdy",
  "ayubowan",
  "ayubo",
  "vanakkam",
  "good morning",
  "good afternoon",
  "good evening",
  "greetings",
]);

function normalizeText(value: string): string {
  let output = "";
  let previousWasSpace = true;
  for (const char of value.toLowerCase()) {
    const code = char.charCodeAt(0);
    const isWordChar =
      (code >= 48 && code <= 57) ||
      (code >= 97 && code <= 122) ||
      (code >= 0x0d80 && code <= 0x0dff) ||
      (code >= 0x0b80 && code <= 0x0bff);
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

function includesKeyword(message: string, keyword: string): boolean {
  return ` ${normalizeText(message)} `.includes(` ${normalizeText(keyword)} `);
}

export function messageSignalsShoppingIntent(message: string): boolean {
  return PRODUCT_KEYWORDS.some((keyword) => includesKeyword(message, keyword));
}

/** Short opener with no shopping ask — works on any turn, not only the first message. */
export function isGreetingOnlyMessage(message: string): boolean {
  const normalized = normalizeText(message);
  return GREETING_ONLY_MESSAGES.has(normalized);
}

export function detectIntent(message: string, isFirstMessage: boolean): ChatIntent {
  if (CHECKOUT_KEYWORDS.some((keyword) => includesKeyword(message, keyword))) return "checkout";
  if (FAQ_KEYWORDS.some((keyword) => includesKeyword(message, keyword))) return "faq";
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
  if (intent === "checkout" || funnelStage === "checkout") {
    return "checkout_ready";
  }

  if (funnelStage === "cart") {
    return "cart_review";
  }

  if (intent === "faq") {
    if (funnelStage === "objection") {
      return "faq_objection";
    }
    return "faq_policy";
  }

  if (intent === "greeting") {
    return messageMentionsProducts(message) ? "product_browse" : "faq_policy";
  }

  if (intent === "product" || messageMentionsProducts(message)) {
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
