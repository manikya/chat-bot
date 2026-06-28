import type { ChatIntent, ChatSubIntent, FunnelStage, QualificationState, WidgetAction } from "@commercechat/shared";
import { buildCatalogPriceBands, type CatalogSearchHints } from "../catalog/products";
import type { StoredMessage } from "./conversation";
import type { CartState } from "./cart";
import type { SearchProductHit } from "./product-reply";
import { extractProductHitsFromTools, productSearchWasEmpty } from "./product-reply";
import { chooseEngagementMove } from "./engagement-policy";
import { formatMoney } from "./locale";
import { plannerRecoveryActions, type SalesPlan } from "./sales-planner";

const PAGE_WORD_STOP = new Set(["products", "product", "collections", "collection", "shop", "store"]);

function formatPriceLabel(price: number, currency?: string): string {
  const code = currency || "USD";
  try {
    return new Intl.NumberFormat(code === "LKR" ? "en-LK" : "en", {
      style: "currency",
      currency: code,
    }).format(price);
  } catch {
    return `${code} ${price}`;
  }
}

function productActions(products: SearchProductHit[], max = 3): WidgetAction[] {
  return products
    .filter((p) => p.inStock !== false)
    .slice(0, max)
    .map((p) => ({
      type: "product" as const,
      sku: p.sku,
      label: `${p.name} — ${formatPriceLabel(p.price, p.currency)}`,
      action: "add_to_cart" as const,
    }));
}

function messageAction(label: string, message: string): WidgetAction {
  return { type: "message", label, message };
}

function pageTerms(pageUrl?: string): string[] {
  if (!pageUrl) return [];
  try {
    return new URL(pageUrl).pathname
      .split(/[\/\-_]+/)
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length >= 3 && !PAGE_WORD_STOP.has(part))
      .slice(-4);
  } catch {
    return [];
  }
}

function termsFromHints(catalogHints?: CatalogSearchHints): string[] {
  return [
    ...(catalogHints?.starterIntents ?? []),
    ...(catalogHints?.offeringTypes ?? []),
    ...(catalogHints?.audiences ?? []),
    ...(catalogHints?.decisionFactors ?? []),
    ...(catalogHints?.categories ?? []),
    ...(catalogHints?.occasions ?? []),
    ...(catalogHints?.useCases ?? []),
    ...(catalogHints?.materials ?? []),
    ...(catalogHints?.styles ?? []),
    ...(catalogHints?.tags ?? []),
  ];
}

function rankedHintActions(input: {
  catalogHints?: CatalogSearchHints;
  pageUrl?: string;
  qualification?: QualificationState;
  max?: number;
}): WidgetAction[] {
  const { catalogHints, pageUrl, qualification, max = 3 } = input;
  const page = pageTerms(pageUrl);
  const seen = new Set<string>();
  const terms = termsFromHints(catalogHints);
  const ranked = terms
    .map((term) => {
      const normalized = term.trim();
      let score = 0;
      if (!normalized || seen.has(normalized.toLowerCase())) return null;
      seen.add(normalized.toLowerCase());
      if (qualification?.category && normalized.toLowerCase() === qualification.category.toLowerCase()) score += 6;
      if (qualification?.constraints?.some((c) => c.toLowerCase() === normalized.toLowerCase())) score += 4;
      if (page.some((part) => normalized.toLowerCase().includes(part) || part.includes(normalized.toLowerCase()))) score += 5;
      if ((catalogHints?.categories ?? []).includes(normalized)) score += 3;
      if ((catalogHints?.occasions ?? []).includes(normalized)) score += 2;
      return { term: normalized, score };
    })
    .filter((item): item is { term: string; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term))
    .slice(0, max);

  return ranked.map(({ term }) => messageAction(term, `Show me ${term}`));
}

function contextualPriceBands(catalogHints?: CatalogSearchHints, qualification?: QualificationState) {
  const candidates = [qualification?.category, ...(qualification?.constraints ?? [])]
    .map((term) => term?.trim())
    .filter((term): term is string => Boolean(term));
  for (const term of candidates) {
    const materialBands = catalogHints?.priceBandsByMaterial?.[term];
    if (materialBands?.length) return materialBands;
    const categoryBands = catalogHints?.priceBandsByCategory?.[term];
    if (categoryBands?.length) return categoryBands;
  }
  return catalogHints?.priceBands;
}

export function buildBudgetSuggestedActions(
  catalogHints?: CatalogSearchHints,
  products: SearchProductHit[] = [],
  qualification?: QualificationState
): WidgetAction[] {
  const contextualBands = contextualPriceBands(catalogHints, qualification);
  const bands = contextualBands?.length ? contextualBands : buildCatalogPriceBands(products);
  return bands.slice(0, 3).map((band) => messageAction(band.label, band.message));
}

function hasFocusedQualification(qualification?: QualificationState): boolean {
  return Boolean(
    qualification?.recipient ||
      qualification?.category ||
      qualification?.constraints?.some((constraint) => !isBroadAnchorTerm(constraint))
  );
}

function normalizeTerm(value: string): string {
  let output = "";
  let previousWasSpace = true;
  for (const char of value.toLowerCase()) {
    const code = char.charCodeAt(0);
    const isWordChar = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
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

function uniqueTerms(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const value of values) {
    const label = value?.trim();
    const key = label ? normalizeTerm(label) : "";
    if (!label || !key || seen.has(key)) continue;
    seen.add(key);
    terms.push(label);
  }
  return terms;
}

function focusedConstraintTerms(qualification?: QualificationState): string[] {
  return uniqueTerms(
    (qualification?.constraints ?? []).filter(
      (constraint) => !isBroadAnchorTerm(constraint) && !isBudgetTierTerm(constraint) && !isBudgetPhraseTerm(constraint)
    )
  );
}

function budgetPhrase(qualification?: QualificationState, market: "default" | "lk" = "default"): string {
  const currency = market === "lk" ? "LKR" : "USD";
  if (qualification?.budget?.max != null) return `under ${formatMoney(qualification.budget.max, currency)}`;
  if (qualification?.budget?.min != null) return `above ${formatMoney(qualification.budget.min, currency)}`;
  return "";
}

function isBroadAnchorTerm(value?: string): boolean {
  return ["decor", "decoration", "decorative", "gift", "gifts", "gifting", "home decor", "event", "personal use"].includes(
    normalizeTerm(value ?? "")
  );
}

function isBudgetTierTerm(value?: string): boolean {
  return ["budget", "budget friendly", "mid range", "premium", "premium picks", "luxury"].includes(
    normalizeTerm(value ?? "")
  );
}

function hasDigit(value?: string): boolean {
  return [...(value ?? "")].some((char) => {
    const code = char.charCodeAt(0);
    return code >= 48 && code <= 57;
  });
}

function isBudgetPhraseTerm(value?: string): boolean {
  const normalized = normalizeTerm(value ?? "");
  if (!normalized) return false;
  if (hasDigit(normalized)) return true;
  return ["under", "above", "from", "to", "less", "than", "within", "lkr", "rs", "usd", "price", "range"].some((term) =>
    ` ${normalized} `.includes(` ${term} `)
  );
}

function phraseFromTerms(terms: Array<string | undefined>): string {
  return uniqueTerms(terms).join(" ").trim();
}

function termTokens(value?: string): Set<string> {
  return new Set(normalizeTerm(value ?? "").split(" ").filter((token) => token.length >= 3));
}

function hasHighTokenOverlap(left?: string, right?: string): boolean {
  const leftTokens = termTokens(left);
  const rightTokens = termTokens(right);
  if (!leftTokens.size || !rightTokens.size) return false;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.min(leftTokens.size, rightTokens.size) >= 0.6;
}

function appendContextPhrase(base: string, context?: string): string {
  if (!context) return base;
  const normalizedBase = normalizeTerm(base);
  const normalizedContext = normalizeTerm(context);
  if (!base || !normalizedContext || normalizedBase.includes(normalizedContext)) return base;
  return phraseFromTerms([base, context]);
}

function productSearchMeta(toolResults: Array<{ tool: string; success: boolean; result: unknown }>): {
  query?: string;
  visibleCount: number;
  totalFound: number;
  hiddenCount: number;
  relaxedPriceCoverage?: { min?: number; max?: number };
  blockedBy?: "budget" | "stock" | "constraints";
} {
  const search = toolResults.find((item) => (item.tool === "search_products" || item.tool === "search_offerings") && item.success);
  const result = search?.result as
    | {
        query?: string;
        products?: unknown[];
        totalFound?: number;
        observation?: {
          hiddenResultCount?: number;
          visibleCount?: number;
          resultCount?: number;
          relaxedPriceCoverage?: { min?: number; max?: number };
          blockedBy?: "budget" | "stock" | "constraints";
        };
      }
    | undefined;
  const visibleCount = result?.observation?.visibleCount ?? result?.products?.length ?? 0;
  const totalFound = result?.totalFound ?? result?.observation?.resultCount ?? visibleCount;
  return {
    query: result?.query,
    visibleCount,
    totalFound,
    hiddenCount: result?.observation?.hiddenResultCount ?? Math.max(0, totalFound - visibleCount),
    relaxedPriceCoverage: result?.observation?.relaxedPriceCoverage,
    blockedBy: result?.observation?.blockedBy,
  };
}

function currentSearchPhrase(qualification?: QualificationState, query?: string): string {
  const selected: string[] = [];
  const broadContext: string[] = [];
  const add = (value?: string) => {
    const label = value?.trim();
    const key = normalizeTerm(label ?? "");
    if (!label || !key || isBudgetTierTerm(label) || isBudgetPhraseTerm(label)) return;
    if (["gift", "gifts", "gifting"].includes(key)) {
      broadContext.push("gifts");
      return;
    }
    if (["brass items", "items", "item", "options"].includes(key)) return;
    if (selected.some((existing) => hasHighTokenOverlap(existing, label))) return;
    selected.push(label);
  };
  for (const constraint of qualification?.constraints ?? []) add(constraint);
  add(qualification?.category);
  const focused = phraseFromTerms(selected);
  if (focused) return phraseFromTerms([focused, broadContext[0]]);
  const queryTerms = (query ?? "")
    .split(/\s+/)
    .filter((term) => {
      const key = normalizeTerm(term);
      return key && !["gift", "gifts", "for", "under", "above", "from", "to", "lkr", "rs", "usd"].includes(key) && !hasDigit(key);
    })
    .slice(0, 4)
    .join(" ")
    .trim();
  return queryTerms || "options";
}

function compactActionLabel(value: string, maxLength = 54): string {
  if (value.length <= maxLength) return value;
  const words = value.split(/\s+/);
  let next = "";
  for (const word of words) {
    const candidate = next ? `${next} ${word}` : word;
    if (candidate.length > maxLength) break;
    next = candidate;
  }
  return next || value.slice(0, maxLength).trim();
}

function moreDiscoveryActions(input: {
  toolResults: Array<{ tool: string; success: boolean; result: unknown }>;
  qualification?: QualificationState;
}): WidgetAction[] {
  const meta = productSearchMeta(input.toolResults);
  if (meta.hiddenCount <= 0) return [];
  const phrase = currentSearchPhrase(input.qualification, meta.query);
  const actions: WidgetAction[] = [
    messageAction(compactActionLabel(`Show more ${phrase}`), `Show more ${phrase}`),
    messageAction("More like these", "Show more options like these"),
  ];
  if (input.qualification?.budget?.max != null || input.qualification?.budget?.min != null) {
    actions.push(messageAction("Different price range", "Show a different price range"));
  } else {
    actions.push(messageAction("Narrow by budget", "Help me narrow by budget"));
  }
  return actions.slice(0, 3);
}

function recoveryActions(input: {
  qualification?: QualificationState;
  catalogHints?: CatalogSearchHints;
  market?: "default" | "lk";
  meta?: ReturnType<typeof productSearchMeta>;
}): WidgetAction[] {
  const { qualification, catalogHints, market = "default", meta } = input;
  const specificCategory =
    qualification?.category && !isBroadAnchorTerm(qualification.category) ? qualification.category : undefined;
  const focused = uniqueTerms([...focusedConstraintTerms(qualification), specificCategory]);
  const latest = focused.at(-1);
  const broadContext = isBroadAnchorTerm(qualification?.category) ? qualification?.category : undefined;
  const anchorPhrase = phraseFromTerms([...focused.filter((term) => term !== latest), broadContext]);
  const failedRefinementPhrase = appendContextPhrase(latest ?? "", broadContext);
  const premiumPhrase = appendContextPhrase(anchorPhrase || focused[0] || "", broadContext);
  const budget = budgetPhrase(qualification, market);
  const actions: WidgetAction[] = [];
  const add = (label: string, message: string) => {
    const key = normalizeTerm(label);
    if (key && !actions.some((action) => normalizeTerm(action.label) === key)) actions.push(messageAction(label, message));
  };

  if (meta?.blockedBy === "budget" && meta.relaxedPriceCoverage?.min != null && (premiumPhrase || focused[0])) {
    const phrase = focused[0] || premiumPhrase;
    const currency = market === "lk" ? "LKR" : "USD";
    add(
      compactActionLabel(`Show ${phrase} from ${formatMoney(meta.relaxedPriceCoverage.min, currency)}`),
      `Show ${phrase} from ${formatMoney(meta.relaxedPriceCoverage.min, currency)}`
    );
    add(compactActionLabel(`All ${phrase}`), `Show all ${phrase}`);
    add("Different budget", "Show a different price range");
    return actions.slice(0, 3);
  }

  if (latest && anchorPhrase) {
    add(compactActionLabel(`All ${anchorPhrase}`), `Show ${anchorPhrase}${budget ? ` ${budget}` : ""} without ${latest}`);
  }
  if (qualification?.budget?.max != null && premiumPhrase) {
    add(compactActionLabel(`Premium ${premiumPhrase}`), `Show premium ${premiumPhrase} above ${formatMoney(qualification.budget.max, market === "lk" ? "LKR" : "USD")}`);
  }
  if (qualification?.budget?.min != null && (anchorPhrase || focused[0])) {
    const phrase = anchorPhrase || focused[0]!;
    add(
      compactActionLabel(`Lower-priced ${phrase}`),
      `Show ${phrase} under ${formatMoney(qualification.budget.min, market === "lk" ? "LKR" : "USD")}`
    );
    add(compactActionLabel(`All ${phrase}`), `Show all ${phrase}`);
  }
  if (latest) {
    const materialTerms = new Set((catalogHints?.materials ?? []).map(normalizeTerm));
    const latestKey = normalizeTerm(latest);
    if (materialTerms.has(latestKey)) {
      add(`${latest} any style`, `Show ${latest}${budget ? ` ${budget}` : ""} in any style`);
    } else {
      add(`${failedRefinementPhrase || latest} any material`, `Show ${failedRefinementPhrase || latest}${budget ? ` ${budget}` : ""} in any material`);
    }
  }

  return actions.slice(0, 3);
}

export function buildSuggestedCtas(input: {
  funnelStage?: FunnelStage;
  subIntent?: ChatSubIntent;
  toolResults: Array<{ tool: string; success: boolean; result: unknown }>;
  cart: CartState | null;
  channel?: string;
  gateProductSearch?: boolean;
  market?: "default" | "lk";
  catalogHints?: CatalogSearchHints;
  pageUrl?: string;
  qualification?: QualificationState;
  salesPlan?: SalesPlan | null;
  closeIntent?: SalesPlan["closeIntent"];
  budgetQuestion?: boolean;
}): WidgetAction[] {
  const { funnelStage, subIntent, toolResults, cart, channel, gateProductSearch, market, catalogHints, pageUrl, qualification, salesPlan, closeIntent, budgetQuestion } =
    input;
  const products = extractProductHitsFromTools(toolResults);
  const inStockProducts = products.filter((p) => p.inStock !== false);
  const hasCards = inStockProducts.length > 0;
  const emptyProductSearch = productSearchWasEmpty(toolResults);
  const cartCount = cart?.items.length ?? 0;
  const moreActions = moreDiscoveryActions({ toolResults, qualification });
  const searchMeta = productSearchMeta(toolResults);

  if (gateProductSearch) {
    const priceActions = buildBudgetSuggestedActions(catalogHints, products, qualification);
    if (budgetQuestion) return priceActions.slice(0, 3);
    const hintActions = rankedHintActions({ catalogHints, pageUrl, qualification, max: 2 });
    return [...priceActions, ...hintActions].slice(0, 3);
  }

  if (closeIntent === "product_interest") {
    return [];
  }

  if (subIntent === "checkout_ready" || funnelStage === "checkout") {
    return [
      {
        type: "checkout",
        label: "Get checkout link",
        action: "checkout",
        message: "I'd like to checkout",
      },
    ];
  }

  if (subIntent === "cart_review" || funnelStage === "cart" || cartCount > 0) {
    const actions: WidgetAction[] = [
      {
        type: "checkout",
        label: "Checkout now",
        action: "checkout",
        message: "I'm ready to checkout",
      },
    ];
    if (!hasCards && cartCount > 0) {
      actions.unshift({
        type: "message",
        label: "What's in my cart?",
        message: "What's in my cart?",
      });
    }
    return actions.slice(0, 3);
  }

  if (channel === "web" && hasCards) {
    return moreActions;
  }

  if (subIntent === "faq_objection" || funnelStage === "objection") {
    return [
      {
        type: "message",
        label: "View return policy",
        message: "What is your return policy?",
      },
      {
        type: "message",
        label: "Shipping info",
        message: "How does shipping work?",
      },
    ];
  }

  if (emptyProductSearch && hasFocusedQualification(qualification)) {
    const plannerActions = plannerRecoveryActions(salesPlan ?? null);
    if (searchMeta.blockedBy === "budget") {
      return recoveryActions({ qualification, catalogHints, market, meta: searchMeta }).slice(0, 3);
    }
    return (plannerActions.length ? plannerActions : recoveryActions({ qualification, catalogHints, market, meta: searchMeta })).slice(0, 3);
  }

  if (subIntent === "product_compare" || funnelStage === "compare") {
    if (inStockProducts.length) return productActions(inStockProducts, 3);
    if (salesPlan?.subIntent === "product_detail" || salesPlan?.availabilityQuestion || salesPlan?.attributeRequest) return [];
    const hintActions = rankedHintActions({ catalogHints, pageUrl, qualification, max: 3 });
    return hintActions.length ? hintActions : [];
  }

  if (funnelStage === "discover" || subIntent === "product_browse") {
    if (inStockProducts.length) return moreActions.length ? moreActions : productActions(inStockProducts, 2);
    if (products.length) {
      return [
        {
          type: "message",
          label: "Similar in stock",
          message: "Show similar items that are in stock",
        },
      ];
    }
    if (salesPlan?.subIntent === "product_detail" || salesPlan?.availabilityQuestion || salesPlan?.attributeRequest) return [];
    const hintActions = rankedHintActions({ catalogHints, pageUrl, qualification, max: 3 });
    return hintActions.length ? hintActions : [];
  }

  if (inStockProducts.length) return productActions(inStockProducts, 3);
  return [];
}

export function appendCtaPromptLine(
  reply: string,
  ctas: WidgetAction[],
  options?: { gateProductSearch?: boolean }
): string {
  const trimmed = reply.trim();
  if (!trimmed || !ctas.length) return reply;
  if (options?.gateProductSearch) return trimmed;
  if (trimmed.endsWith("?")) return reply;

  const primary = ctas[0]!;
  if (primary.action === "add_to_cart" && primary.sku) {
    const name = primary.label.split(" — ")[0] ?? "this item";
    return `${trimmed}\n\nAdd ${name} to cart?`;
  }
  if (primary.action === "checkout") {
    return `${trimmed}\n\nReady to checkout?`;
  }
  if (primary.type === "message" && primary.message) {
    return trimmed;
  }
  return reply;
}

export function applyEngagementQuestion(
  reply: string,
  input: {
    intent?: ChatIntent;
    funnelStage?: FunnelStage;
    subIntent?: ChatSubIntent;
    qualification?: QualificationState;
    products?: SearchProductHit[];
    catalogHints?: CatalogSearchHints;
    suggestedActions?: WidgetAction[];
    history?: StoredMessage[];
  }
): { reply: string; suggestedActions?: WidgetAction[] } {
  const trimmed = reply.trim();
  const move = chooseEngagementMove({ reply, ...input });
  return move
    ? { reply: `${trimmed}\n\n${move.question}`, suggestedActions: move.suggestedActions }
    : { reply };
}

export function appendEngagementQuestion(
  reply: string,
  input: Parameters<typeof applyEngagementQuestion>[1]
): string {
  return applyEngagementQuestion(reply, input).reply;
}
