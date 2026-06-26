import type { ChatSubIntent, FunnelStage, QualificationState } from "@commercechat/shared";
import type { CatalogSearchHints } from "../catalog/products";
import type { ChatMarket } from "./locale";

function normalize(message: string): string {
  return message.toLowerCase().trim();
}

function hasKnownBudget(
  _message: string,
  qualification?: QualificationState,
  market: ChatMarket = "default"
): boolean {
  void market;
  return Boolean(qualification?.budget?.max != null || qualification?.budget?.min != null);
}

function hasUseCase(qualification?: QualificationState): boolean {
  return Boolean(
    qualification?.category ||
      qualification?.recipient ||
      qualification?.constraints?.some((c) => !["budget", "budget friendly", "mid range", "premium", "premium picks", "luxury"].includes(normalize(c)))
  );
}

export function hasBudgetOrExplicitShopRequest(
  message: string,
  qualification?: QualificationState,
  market: ChatMarket = "default"
): boolean {
  return hasKnownBudget(message, qualification, market);
}

/** Vague browse — shopper is asking generally but has not supplied enough constraints. */
export function isVagueProductBrowse(_message: string): boolean {
  return false;
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
  if (subIntent === "product_detail" || subIntent === "product_compare") return false;
  const hasBudget = hasKnownBudget(message, qualification, market);
  if (qualification?.category === "gift" && !qualification.recipient) return true;
  if (!hasUseCase(qualification)) return true;
  if (funnelStage !== "discover") return false;
  if (hasBudget) return false;
  if (isVagueProductBrowse(message)) return true;
  if (subIntent === "product_browse" && !hasBudget) return true;
  return false;
}

export function discoverQualifyPrompt(
  message: string,
  _market: ChatMarket = "default",
  catalogHints?: CatalogSearchHints
): string {
  const budgetExample = catalogHints?.priceBands?.length
    ? catalogHints.priceBands
        .slice(0, 2)
        .map((band) => band.label.toLowerCase())
        .join(" or ")
    : "";
  const budgetSuffix = budgetExample ? ` (${budgetExample})` : "";

  void message;
  return `Sure. Is it for a gift or personal use, and what's your budget${budgetSuffix}?`;
}
