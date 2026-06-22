import type { ChatSubIntent, FunnelStage, QualificationState } from "@commercechat/shared";
import type { ChatMarket } from "./locale";
import { extractBudgetFromMessage } from "./qualification";

/** Vague browse — "do you have…", "I saw…", not a SKU or explicit "show me". */
export function isVagueProductBrowse(message: string): boolean {
  const lower = message.toLowerCase().trim();
  if (/\bSKU[:\s-]*[A-Z0-9][A-Z0-9_-]{2,}\b/i.test(message)) return false;
  if (/\b(show me|show us|add to cart|buy now|checkout|best sellers|recommend|compare these)\b/i.test(lower)) {
    return false;
  }
  if (/\b(under|below|less than|max|upto|up to)\s*(?:rs\.?|lkr|\$|€|£)?\s*[\d,]+/i.test(lower)) {
    return false;
  }
  return /\b(do you have|do u have|have you got|got any|any .+\?|something like|i saw|i seen|wondering if|looking for something)\b/i.test(
    lower
  );
}

export function hasBudgetOrExplicitShopRequest(
  message: string,
  qualification?: QualificationState,
  market: ChatMarket = "default"
): boolean {
  if (qualification?.budget?.max != null || qualification?.budget?.min != null) return true;
  if (extractBudgetFromMessage(message, market)) return true;
  const lower = message.toLowerCase();
  if (/\b(show me|recommend|best sellers|add to cart|compare|cheapest|most expensive|premium)\b/i.test(lower)) {
    return true;
  }
  if (/\bSKU[:\s-]*[A-Z0-9]/i.test(message)) return true;
  return false;
}

function isUnderspecifiedGiftBrowse(message: string, qualification?: QualificationState): boolean {
  const lower = message.toLowerCase();
  if (qualification?.budget?.max != null || qualification?.budget?.min != null) return false;
  if (/\b(show me|show us|recommend|best sellers|cheapest|most expensive|premium)\b/i.test(lower)) {
    return false;
  }
  return /\b(gift|gifts|looking for|need something|want something|ideas?)\b/i.test(lower);
}

/** Block catalog search/tools until shopper gives budget or a concrete request. */
export function shouldGateProductSearch(input: {
  funnelStage?: FunnelStage;
  subIntent?: ChatSubIntent;
  qualification?: QualificationState;
  message: string;
  market?: ChatMarket;
}): boolean {
  const { funnelStage, subIntent, qualification, message, market = "default" } = input;
  if (isUnderspecifiedGiftBrowse(message, qualification)) return true;
  if (funnelStage !== "discover") return false;
  if (subIntent === "product_detail" || subIntent === "product_compare") return false;
  if (hasBudgetOrExplicitShopRequest(message, qualification, market)) return false;
  if (isVagueProductBrowse(message)) return true;
  if (subIntent === "product_browse" && !qualification?.budget?.max && !qualification?.budget?.min) {
    return true;
  }
  return false;
}

export function discoverQualifyPrompt(
  message: string,
  market: ChatMarket = "default"
): string {
  const lower = message.toLowerCase();
  const mentionsGift = /\bgift\b/.test(lower) || /\bfor\s+(my\s+)?(mom|dad|wife|husband|friend|him|her)\b/i.test(lower);
  const budgetExample = market === "lk" ? "under LKR 3,000 or higher" : "under $50 or higher";

  if (mentionsGift) {
    return `Sure. Who is it for, and what budget do you have in mind (${budgetExample})?`;
  }
  return `Sure. Is it for a gift or personal use, and what's your budget (${budgetExample})?`;
}
