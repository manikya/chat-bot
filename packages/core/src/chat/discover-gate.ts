import type { ChatSubIntent, FunnelStage, QualificationState } from "@commercechat/shared";
import type { ChatMarket } from "./locale";
import { extractBudgetFromMessage } from "./qualification";

const SKU_PATTERN = /\bSKU[:\s-]*[A-Z0-9][A-Z0-9_-]{2,}\b/i;

const DIRECT_PRODUCT_ACTION_PATTERNS = [
  /\badd\s+.+\s+to\s+cart\b/i,
  /\badd\s+to\s+cart\b/i,
  /\bbuy\s+(now|this|that|it)\b/i,
  /\bcheckout\b/i,
  /\bcompare\s+(these|this|that|sku|\w+)/i,
  /\btell\s+me\s+more\s+about\s+SKU\b/i,
  /\b(details?|specs?|specifications?)\b.*\bSKU\b/i,
];

const PRICE_TIER_PATTERNS = [
  /\bcheapest\b/i,
  /\bbudget[-\s]?friendly\b/i,
  /\baffordable\b/i,
  /\blow(?:er)?\s+price\b/i,
  /\bmost\s+expensive\b/i,
  /\bpremium\b/i,
  /\bluxury\b/i,
];

const BROAD_RECOMMENDATION_PATTERNS = [
  /\bbest\s*-?\s*sellers?\b/i,
  /\b(top|popular|trending)\s+(picks?|items?|products?|options?)\b/i,
  /\b(what|which)\s+(do\s+you\s+)?recommend\b/i,
  /\b(can|could)\s+you\s+(recommend|suggest)\b/i,
  /\b(recommend|suggest)\s+(me\s+)?(something|items?|products?|options?)\b/i,
  /\bshow\s+(me|us)\b/i,
  /\b(suitable|good|ideal|perfect)\s+for\b/i,
  /\bsomething\s+(suitable|nice|good|special)\b/i,
  /\b(gift\s+)?ideas?\b/i,
];

const GIFT_OR_OCCASION_PATTERNS = [
  /\bgifts?\b/i,
  /\bfather'?s\s+day\b/i,
  /\bmother'?s\s+day\b/i,
  /\bbirthday\b/i,
  /\banniversary\b/i,
  /\bwedding\b/i,
  /\bhousewarming\b/i,
  /\bcorporate\b/i,
  /\bcooperate\b/i,
  /\bevent\b/i,
];

const VAGUE_BROWSE_PATTERNS = [
  /\bdo\s+(you|u)\s+have\b/i,
  /\bhave\s+you\s+got\b/i,
  /\bgot\s+any\b/i,
  /\bany\s+.+\?/i,
  /\bsomething\s+like\b/i,
  /\bi\s+(saw|seen)\b/i,
  /\bwondering\s+if\b/i,
  /\blooking\s+for\s+something\b/i,
  /\bneed\s+something\b/i,
  /\bwant\s+something\b/i,
];

function normalize(message: string): string {
  return message.toLowerCase().trim();
}

function matchesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

function hasSku(message: string): boolean {
  return SKU_PATTERN.test(message);
}

function hasKnownBudget(
  message: string,
  qualification?: QualificationState,
  market: ChatMarket = "default"
): boolean {
  return Boolean(
    qualification?.budget?.max != null ||
      qualification?.budget?.min != null ||
      extractBudgetFromMessage(message, market)
  );
}

function isDirectProductAction(message: string): boolean {
  return hasSku(message) || matchesAny(message, DIRECT_PRODUCT_ACTION_PATTERNS);
}

function isPriceTierRequest(message: string): boolean {
  return matchesAny(message, PRICE_TIER_PATTERNS);
}

function isBroadRecommendationRequest(message: string): boolean {
  return matchesAny(message, BROAD_RECOMMENDATION_PATTERNS);
}

function isGiftOrOccasionBrowse(message: string): boolean {
  return matchesAny(message, GIFT_OR_OCCASION_PATTERNS);
}

function hasUseCase(qualification?: QualificationState): boolean {
  return Boolean(
    qualification?.category ||
      qualification?.recipient ||
      qualification?.constraints?.some((c) => /gift|corporate|cooperate|event|giveaway|decor|award|personal/i.test(c))
  );
}

export function hasBudgetOrExplicitShopRequest(
  message: string,
  qualification?: QualificationState,
  market: ChatMarket = "default"
): boolean {
  return hasKnownBudget(message, qualification, market) || isDirectProductAction(message) || isPriceTierRequest(message);
}

function isUnderspecifiedGiftBrowse(message: string, qualification?: QualificationState): boolean {
  if (qualification?.budget?.max != null || qualification?.budget?.min != null) return false;
  if (isDirectProductAction(message) || isPriceTierRequest(message)) return false;
  return isGiftOrOccasionBrowse(message);
}

/** Vague browse — shopper is asking generally but has not supplied enough constraints. */
export function isVagueProductBrowse(message: string): boolean {
  if (isDirectProductAction(message) || hasKnownBudget(message) || isPriceTierRequest(message)) return false;
  return matchesAny(message, VAGUE_BROWSE_PATTERNS) || isBroadRecommendationRequest(message);
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
  if (isDirectProductAction(message)) return false;
  if (subIntent === "product_detail" || subIntent === "product_compare") return false;
  const hasBudget = hasKnownBudget(message, qualification, market);
  if (qualification?.category === "gift" && !qualification.recipient) return true;
  if (isBroadRecommendationRequest(message) && !hasUseCase(qualification)) return true;
  if (!hasBudget && isUnderspecifiedGiftBrowse(message, qualification)) return true;
  if (!hasBudget && isBroadRecommendationRequest(message)) return true;
  if (funnelStage !== "discover") return false;
  if (hasBudget || isPriceTierRequest(message)) return false;
  if (isVagueProductBrowse(message)) return true;
  if (subIntent === "product_browse" && !hasBudget) return true;
  return false;
}

export function discoverQualifyPrompt(
  message: string,
  market: ChatMarket = "default"
): string {
  const lower = normalize(message);
  const budgetExample = market === "lk" ? "under LKR 3,000 or higher" : "under $50 or higher";

  if (/\bgifts?\b/.test(lower) || /\bfor\s+(my\s+)?(mom|dad|wife|husband|friend|him|her)\b/i.test(lower)) {
    return `Sure. Who is it for, and what budget do you have in mind (${budgetExample})?`;
  }
  if (/\b(corporate|cooperate|event)\b/i.test(lower)) {
    return `Sure. What budget should I stay within for the event (${budgetExample})?`;
  }
  if (/\bbest\s*-?\s*sellers?\b/i.test(lower)) {
    return `Sure. What budget should I stay within before I show best sellers (${budgetExample})?`;
  }
  return `Sure. Is it for a gift or personal use, and what's your budget (${budgetExample})?`;
}
