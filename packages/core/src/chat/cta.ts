import type { ChatIntent, ChatSubIntent, FunnelStage, QualificationState, WidgetAction } from "@commercechat/shared";
import { buildCatalogPriceBands, type CatalogSearchHints } from "../catalog/products";
import type { StoredMessage } from "./conversation";
import type { CartState } from "./cart";
import type { SearchProductHit } from "./product-reply";
import { extractProductHitsFromTools, productSearchWasEmpty } from "./product-reply";
import { chooseEngagementMove } from "./engagement-policy";
import { formatMoney } from "./locale";

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

function budgetActions(catalogHints?: CatalogSearchHints, products: SearchProductHit[] = []): WidgetAction[] {
  const bands = catalogHints?.priceBands?.length ? catalogHints.priceBands : buildCatalogPriceBands(products);
  return bands.slice(0, 3).map((band) => messageAction(band.label, band.message));
}

function hasFocusedQualification(qualification?: QualificationState): boolean {
  return Boolean(
    qualification?.recipient ||
      qualification?.category ||
      qualification?.constraints?.some((constraint) => !/^(decor|decoration|gift|gifting|home decor|event|personal use)$/i.test(constraint.trim()))
  );
}

function normalizeTerm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
      (constraint) => !/^(decor|decoration|gift|gifting|home decor|event|personal use|budget|budget friendly|mid range|premium|premium picks|luxury)$/i.test(constraint.trim())
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
  return /^(decor|decoration|decorative|gift|gifting|home decor|event|personal use)$/i.test(value?.trim() ?? "");
}

function phraseFromTerms(terms: Array<string | undefined>): string {
  return uniqueTerms(terms).join(" ").trim();
}

function appendContextPhrase(base: string, context?: string): string {
  if (!context) return base;
  const normalizedBase = normalizeTerm(base);
  const normalizedContext = normalizeTerm(context);
  if (!base || !normalizedContext || normalizedBase.includes(normalizedContext)) return base;
  return phraseFromTerms([base, context]);
}

function recoveryActions(input: {
  qualification?: QualificationState;
  catalogHints?: CatalogSearchHints;
  market?: "default" | "lk";
}): WidgetAction[] {
  const { qualification, catalogHints, market = "default" } = input;
  const focused = focusedConstraintTerms(qualification);
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

  if (latest && anchorPhrase) {
    add(`All ${anchorPhrase}`, `Show ${anchorPhrase}${budget ? ` ${budget}` : ""} without ${latest}`);
  }
  if (qualification?.budget?.max != null && premiumPhrase) {
    add(`Premium ${premiumPhrase}`, `Show premium ${premiumPhrase} above ${formatMoney(qualification.budget.max, market === "lk" ? "LKR" : "USD")}`);
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
}): WidgetAction[] {
  const { funnelStage, subIntent, toolResults, cart, channel, gateProductSearch, market, catalogHints, pageUrl, qualification } =
    input;
  const products = extractProductHitsFromTools(toolResults);
  const inStockProducts = products.filter((p) => p.inStock !== false);
  const hasCards = inStockProducts.length > 0;
  const emptyProductSearch = productSearchWasEmpty(toolResults);
  const cartCount = cart?.items.length ?? 0;

  if (gateProductSearch) {
    const hintActions = rankedHintActions({ catalogHints, pageUrl, qualification, max: 2 });
    return [...hintActions, ...budgetActions(catalogHints, products)].slice(0, 3);
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
    return [];
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

  if (subIntent === "product_compare" || funnelStage === "compare") {
    if (inStockProducts.length) return productActions(inStockProducts, 3);
    const hintActions = rankedHintActions({ catalogHints, pageUrl, qualification, max: 3 });
    return hintActions.length ? hintActions : [];
  }

  if (funnelStage === "discover" || subIntent === "product_browse") {
    if (inStockProducts.length) return productActions(inStockProducts, 2);
    if (products.length) {
      return [
        {
          type: "message",
          label: "Similar in stock",
          message: "Show similar items that are in stock",
        },
      ];
    }
    if (emptyProductSearch && hasFocusedQualification(qualification)) {
      return recoveryActions({ qualification, catalogHints, market });
    }
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
