import type { ChatIntent, ChatSubIntent, FunnelStage, QualificationState, WidgetAction } from "@commercechat/shared";
import type { CatalogPriceBand, CatalogSearchHints } from "../catalog/products";
import type { LLMProvider } from "../llm/types";
import type { StoredMessage } from "./conversation";

export const PLANNER_CONFIDENCE_THRESHOLD = 0.55;

const CHAT_INTENTS: ChatIntent[] = ["faq", "product", "checkout", "greeting", "unknown"];
const CHAT_SUB_INTENTS: ChatSubIntent[] = [
  "product_browse",
  "product_compare",
  "product_detail",
  "faq_policy",
  "faq_objection",
  "cart_review",
  "checkout_ready",
  "order_status",
];
const FUNNEL_STAGES: FunnelStage[] = ["discover", "compare", "objection", "cart", "checkout"];
const PLAN_ACTIONS = [
  "ask_question",
  "answer",
  "search_products",
  "compare_products",
  "get_product_details",
  "cart_action",
  "handoff_suggested",
] as const;
export type ChatPlanAction = (typeof PLAN_ACTIONS)[number];

const USER_MOVES = [
  "new_request",
  "budget_answer",
  "recipient_answer",
  "style_answer",
  "use_case_answer",
  "chip_selection",
  "show_more",
  "product_question",
  "cart_reply",
  "faq_question",
  "greeting",
  "unknown",
] as const;
export type ChatUserMove = (typeof USER_MOVES)[number];

const ATTRIBUTE_REQUESTS = [
  "height",
  "size",
  "dimensions",
  "color",
  "material",
  "stock",
  "price",
  "availability",
  "none",
] as const;
export type ChatAttributeRequest = (typeof ATTRIBUTE_REQUESTS)[number];

const CLOSE_INTENTS = ["none", "product_interest", "add_to_cart", "checkout_ready"] as const;
export type ChatCloseIntent = (typeof CLOSE_INTENTS)[number];

const TOOL_NAMES = [
  "search_offerings",
  "search_products",
  "get_product_details",
  "add_to_cart",
  "get_cart",
  "create_checkout_link",
  "get_order_status",
  "compare_products",
  "get_related_products",
] as const;
export type PlannedToolName = (typeof TOOL_NAMES)[number];

export interface ChatPlan {
  confidence?: number;
  languageStyle?: "english" | "sinhala" | "tamil" | "singlish" | "mixed" | "unknown";
  replyLanguage?: "english" | "sinhala" | "tamil" | "singlish" | "mixed" | "unknown";
  userMove?: ChatUserMove;
  intent?: ChatIntent | "product_search" | "gift" | "event";
  subIntent?: ChatSubIntent;
  funnelStage?: FunnelStage;
  action?: ChatPlanAction;
  gateProductSearch?: boolean;
  closeIntent?: ChatCloseIntent;
  closeTarget?: { sku?: string; name?: string; confidence?: number };
  contextPolicy?: "continue" | "reset" | "show_more" | "narrow" | "recover";
  resultPolicy?: "exact" | "diversify" | "exclude_seen" | "relax_constraints" | "ask_clarification";
  responsePolicy?: "answer" | "ask_one_question" | "show_cards" | "recover" | "handoff";
  searchQuery?: string;
  ragQuery?: string;
  toolPolicy?: {
    allowedTools?: PlannedToolName[];
  };
  missingSlot?: "budget" | "recipient" | "use_case" | "style" | "quantity" | "none";
  resetContext?: boolean;
  productType?: string;
  material?: string;
  occasion?: string;
  recipient?: string;
  useCase?: string;
  style?: string;
  quantity?: number;
  budget?: { min?: number; max?: number };
  attributeRequest?: ChatAttributeRequest;
  availabilityQuestion?: boolean;
  nextQuestion?: string;
  replyTone?: "concise" | "consultative" | "premium" | "friendly";
  suggestedActions?: WidgetAction[];
  recoveryActions?: Array<{
    label: string;
    message: string;
    strategy?: "relax_budget" | "relax_material" | "premium_alternative" | "closest_category" | "ask_clarification";
  }>;
  reasonCodes?: string[];
}

export type SalesPlan = ChatPlan;

function isChatIntent(value: unknown): value is ChatIntent {
  return typeof value === "string" && CHAT_INTENTS.includes(value as ChatIntent);
}

function normalizePlanIntent(value: unknown): ChatIntent | undefined {
  if (isChatIntent(value)) return value;
  if (value === "product_search" || value === "gift" || value === "event") return "product";
  return undefined;
}

function isChatSubIntent(value: unknown): value is ChatSubIntent {
  return typeof value === "string" && CHAT_SUB_INTENTS.includes(value as ChatSubIntent);
}

function isFunnelStage(value: unknown): value is FunnelStage {
  return typeof value === "string" && FUNNEL_STAGES.includes(value as FunnelStage);
}

function isPlanAction(value: unknown): value is ChatPlanAction {
  return typeof value === "string" && PLAN_ACTIONS.includes(value as ChatPlanAction);
}

function isChatUserMove(value: unknown): value is ChatUserMove {
  return typeof value === "string" && USER_MOVES.includes(value as ChatUserMove);
}

function isChatAttributeRequest(value: unknown): value is ChatAttributeRequest {
  return typeof value === "string" && ATTRIBUTE_REQUESTS.includes(value as ChatAttributeRequest);
}

function isChatCloseIntent(value: unknown): value is ChatCloseIntent {
  return typeof value === "string" && CLOSE_INTENTS.includes(value as ChatCloseIntent);
}

function isPlannedToolName(value: unknown): value is PlannedToolName {
  return typeof value === "string" && TOOL_NAMES.includes(value as PlannedToolName);
}

function defaultToolsForAction(action: ChatPlanAction): PlannedToolName[] {
  switch (action) {
    case "search_products":
      return ["search_offerings", "search_products", "get_product_details", "get_related_products"];
    case "compare_products":
      return ["compare_products", "search_products", "get_product_details"];
    case "get_product_details":
      return ["get_product_details", "search_products"];
    case "cart_action":
      return ["get_cart", "add_to_cart", "create_checkout_link", "get_order_status"];
    case "answer":
      return [];
    case "ask_question":
      return [];
    case "handoff_suggested":
      return [];
  }
}

function compactHints(catalogHints?: CatalogSearchHints) {
  const compactObject = <T>(value: Record<string, T> | undefined, limit: number): Record<string, T> =>
    Object.fromEntries(Object.entries(value ?? {}).slice(0, limit));
  return {
    categories: catalogHints?.categories?.slice(0, 40) ?? [],
    tags: catalogHints?.tags?.slice(0, 40) ?? [],
    materials: catalogHints?.materials?.slice(0, 30) ?? [],
    occasions: catalogHints?.occasions?.slice(0, 30) ?? [],
    recipients: catalogHints?.recipients?.slice(0, 30) ?? [],
    useCases: catalogHints?.useCases?.slice(0, 30) ?? [],
    styles: catalogHints?.styles?.slice(0, 30) ?? [],
    aliases: catalogHints?.aliases ?? {},
    priceBandsByCategory: catalogHints?.priceBandsByCategory ?? {},
    priceBandsByMaterial: catalogHints?.priceBandsByMaterial ?? {},
    priceBands: catalogHints?.priceBands?.slice(0, 3) ?? [],
    offeringMode: catalogHints?.offeringMode ?? "unknown",
    offeringTypes: catalogHints?.offeringTypes?.slice(0, 30) ?? [],
    useCaseProfiles: catalogHints?.useCaseProfiles ?? {},
    audiences: catalogHints?.audiences?.slice(0, 30) ?? [],
    decisionFactors: catalogHints?.decisionFactors?.slice(0, 20) ?? [],
    starterIntents: catalogHints?.starterIntents?.slice(0, 10) ?? [],
    productTypeHints: catalogHints?.productTypeHints?.slice(0, 25).map((item) => ({
      term: item.term,
      source: item.source,
      inStockCount: item.inStockCount,
      priceCoverage: item.priceCoverage
        ? { min: item.priceCoverage.min, max: item.priceCoverage.max, currency: item.priceCoverage.currency }
        : undefined,
    })) ?? [],
    giftProfiles: compactObject(catalogHints?.giftProfiles, 12),
    attributeSummaries: compactObject(catalogHints?.attributeSummaries, 12),
  };
}

function parsePlanJson(content: string): SalesPlan | null {
  const trimmed = content.trim();
  const jsonText = trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;
  try {
    const parsed = JSON.parse(jsonText) as SalesPlan;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function cleanText(value?: string): string | undefined {
  const text = value?.trim();
  return text && text.length <= 80 ? text : undefined;
}

function isAsciiLetterOrDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isSinhalaChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x0d80 && code <= 0x0dff;
}

function isTamilChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x0b80 && code <= 0x0bff;
}

function normalizeWordText(value: string): string {
  let output = "";
  let previousWasSpace = true;
  for (const char of value.toLowerCase()) {
    if (isAsciiLetterOrDigit(char) || isSinhalaChar(char) || isTamilChar(char)) {
      output += char;
      previousWasSpace = false;
    } else if (!previousWasSpace) {
      output += " ";
      previousWasSpace = true;
    }
  }
  return output.trim();
}

function normalizedWords(value: string): string[] {
  return normalizeWordText(value).split(" ").filter(Boolean);
}

function normalizedIncludesPhrase(message: string, phrase: string): boolean {
  const words = normalizedWords(message);
  const phraseWords = normalizedWords(phrase);
  if (!words.length || !phraseWords.length || phraseWords.length > words.length) return false;
  for (let index = 0; index <= words.length - phraseWords.length; index += 1) {
    if (phraseWords.every((word, offset) => words[index + offset] === word)) return true;
  }
  return false;
}

function normalizeGroundingText(value: string): string {
  return normalizeWordText(value);
}

function isUnknownSlotValue(value: string): boolean {
  const normalized = normalizeWordText(value);
  return ["unknown", "unsure", "not sure", "no idea", "dont know", "don t know", "anything", "any", "none"].includes(normalized);
}

function languageStyleForLatestMessage(message: string, fallback?: SalesPlan["languageStyle"]): SalesPlan["languageStyle"] {
  let hasSinhala = false;
  let hasTamil = false;
  let hasAsciiLetter = false;
  for (const char of message) {
    hasSinhala ||= isSinhalaChar(char);
    hasTamil ||= isTamilChar(char);
    const code = char.charCodeAt(0);
    hasAsciiLetter ||= (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
  }
  if (hasSinhala) return "sinhala";
  if (hasTamil) return "tamil";
  const singlishTerms = ["oya", "eka", "mokak", "kohomada", "thiyenawada", "tiyenawada", "thiyenawa", "pennanna", "karanna", "puluwanda"];
  if (singlishTerms.some((term) => normalizedIncludesPhrase(message, term))) return "singlish";
  if (hasAsciiLetter) return "english";
  return fallback ?? "unknown";
}

function replyLanguageForLatestMessage(message: string, fallback?: SalesPlan["replyLanguage"]): SalesPlan["replyLanguage"] {
  return languageStyleForLatestMessage(message, fallback);
}

function messageContainsSlotValue(message: string, value: string): boolean {
  const normalizedMessage = normalizeGroundingText(message);
  const normalizedValue = normalizeGroundingText(value);
  if (!normalizedMessage || !normalizedValue) return false;
  return normalizedIncludesPhrase(normalizedMessage, normalizedValue);
}

function slotValueMatchesAlias(
  message: string,
  value: string,
  aliases?: Record<string, string[]>
): boolean {
  const normalizedValue = normalizeGroundingText(value);
  if (!normalizedValue) return false;
  return Object.entries(aliases ?? {}).some(([alias, targets]) => {
    if (!messageContainsSlotValue(message, alias)) return false;
    return targets.some((target) => normalizeGroundingText(target) === normalizedValue);
  });
}

function slotValueGroundedInLatestMessage(
  value: string | undefined,
  latestMessage?: string,
  aliases?: Record<string, string[]>
): value is string {
  const cleaned = cleanText(value);
  if (!cleaned || isUnknownSlotValue(cleaned)) return false;
  if (!latestMessage) return true;
  return messageContainsSlotValue(latestMessage, cleaned) || slotValueMatchesAlias(latestMessage, cleaned, aliases);
}

function budgetGroundedInLatestMessage(latestMessage?: string): boolean {
  if (!latestMessage) return true;
  const hasDigit = [...latestMessage].some((char) => {
    const code = char.charCodeAt(0);
    return code >= 48 && code <= 57;
  });
  const budgetTerms = [
    "rs",
    "lkr",
    "usd",
    "under",
    "below",
    "less than",
    "max",
    "upto",
    "up to",
    "within",
    "over",
    "above",
    "at least",
    "from",
    "budget",
    "premium",
    "mid range",
    "budget friendly",
    "affordable",
    "cheap",
    "luxury",
  ];
  return hasDigit || budgetTerms.some((term) => normalizedIncludesPhrase(latestMessage, term));
}

function normalizeActionText(value: string): string {
  return normalizeWordText(value);
}

function allCatalogPriceBands(catalogHints?: CatalogSearchHints): CatalogPriceBand[] {
  const bands = [
    ...(catalogHints?.priceBands ?? []),
    ...Object.values(catalogHints?.priceBandsByCategory ?? {}).flat(),
    ...Object.values(catalogHints?.priceBandsByMaterial ?? {}).flat(),
  ];
  const seen = new Set<string>();
  return bands.filter((band) => {
    const key = `${band.label}|${band.message}|${band.min ?? ""}|${band.max ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function budgetFromCatalogPriceBandMessage(
  latestMessage?: string,
  catalogHints?: CatalogSearchHints
): QualificationState["budget"] | undefined {
  const normalizedMessage = normalizeActionText(latestMessage ?? "");
  if (!normalizedMessage) return undefined;
  const band = allCatalogPriceBands(catalogHints).find((candidate) => {
    const label = normalizeActionText(candidate.label);
    const message = normalizeActionText(candidate.message);
    return normalizedMessage === message || normalizedMessage === label;
  });
  if (!band || (band.min == null && band.max == null)) return undefined;
  return {
    ...(band.min != null ? { min: band.min } : {}),
    ...(band.max != null ? { max: band.max } : {}),
  };
}

export function plannerConfidence(plan: SalesPlan | null): number {
  const confidence = Number(plan?.confidence ?? 0);
  return Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
}

export function trustedSalesPlan(plan: SalesPlan | null): SalesPlan | null {
  if (!plan) return null;
  return plannerConfidence(plan) >= PLANNER_CONFIDENCE_THRESHOLD ? plan : null;
}

export function normalizeChatPlan(
  plan: SalesPlan | null,
  fallback: {
    intent: ChatIntent;
    subIntent: ChatSubIntent;
    funnelStage: FunnelStage;
    gateProductSearch?: boolean;
  }
): SalesPlan | null {
  if (!plan) return null;
  const confidence = plannerConfidence(plan);
  const intent = normalizePlanIntent(plan.intent) ?? fallback.intent;
  const subIntent = isChatSubIntent(plan.subIntent) ? plan.subIntent : fallback.subIntent;
  const funnelStage = isFunnelStage(plan.funnelStage) ? plan.funnelStage : fallback.funnelStage;
  const action = isPlanAction(plan.action) ? plan.action : actionFromPlan(intent, subIntent, funnelStage, Boolean(plan.gateProductSearch ?? fallback.gateProductSearch));
  const userMove = isChatUserMove(plan.userMove) ? plan.userMove : undefined;
  const attributeRequest = isChatAttributeRequest(plan.attributeRequest) ? plan.attributeRequest : undefined;
  const closeIntent = isChatCloseIntent(plan.closeIntent) ? plan.closeIntent : "none";
  const allowedTools = (plan.toolPolicy?.allowedTools?.length ? plan.toolPolicy.allowedTools : defaultToolsForAction(action))
    .filter(isPlannedToolName)
    .filter((tool, index, tools) => tools.indexOf(tool) === index);
  return {
    ...plan,
    confidence,
    userMove,
    attributeRequest,
    closeIntent,
    closeTarget: {
      sku: cleanText(plan.closeTarget?.sku),
      name: cleanText(plan.closeTarget?.name),
      confidence: Number.isFinite(Number(plan.closeTarget?.confidence))
        ? Math.max(0, Math.min(1, Number(plan.closeTarget?.confidence)))
        : undefined,
    },
    intent,
    subIntent,
    funnelStage,
    action,
    gateProductSearch: Boolean(plan.gateProductSearch ?? fallback.gateProductSearch),
    toolPolicy: { allowedTools },
  };
}

export function actionFromPlan(
  intent: ChatIntent,
  subIntent: ChatSubIntent | undefined,
  funnelStage: FunnelStage,
  gateProductSearch: boolean
): ChatPlanAction {
  if (gateProductSearch) return "ask_question";
  if (subIntent === "product_compare") return "compare_products";
  if (subIntent === "product_detail") return "get_product_details";
  if (subIntent === "cart_review" || subIntent === "checkout_ready" || funnelStage === "cart" || funnelStage === "checkout") {
    return "cart_action";
  }
  if (intent === "product") return "search_products";
  return "answer";
}

export function publicSalesPlan(plan: SalesPlan | null) {
  if (!plan) return null;
  const normalizedIntent = normalizePlanIntent(plan.intent);
  return {
    confidence: plannerConfidence(plan),
    trusted: plannerConfidence(plan) >= PLANNER_CONFIDENCE_THRESHOLD,
    languageStyle: plan.languageStyle,
    replyLanguage: plan.replyLanguage,
    userMove: plan.userMove,
    intent: normalizedIntent ?? plan.intent,
    subIntent: plan.subIntent,
    funnelStage: plan.funnelStage,
    action: plan.action,
    gateProductSearch: Boolean(plan.gateProductSearch),
    closeIntent: isChatCloseIntent(plan.closeIntent) ? plan.closeIntent : "none",
    closeTarget: plan.closeTarget
      ? {
          sku: cleanText(plan.closeTarget.sku),
          name: cleanText(plan.closeTarget.name),
          confidence: Number.isFinite(Number(plan.closeTarget.confidence))
            ? Math.max(0, Math.min(1, Number(plan.closeTarget.confidence)))
            : undefined,
        }
      : undefined,
    contextPolicy: plan.contextPolicy,
    resultPolicy: plan.resultPolicy,
    responsePolicy: plan.responsePolicy,
    searchQuery: cleanText(plan.searchQuery),
    ragQuery: cleanText(plan.ragQuery),
    allowedTools: plan.toolPolicy?.allowedTools?.slice(0, 8),
    missingSlot: plan.missingSlot,
    resetContext: Boolean(plan.resetContext),
    productType: cleanText(plan.productType),
    material: cleanText(plan.material),
    occasion: cleanText(plan.occasion),
    recipient: cleanText(plan.recipient),
    useCase: cleanText(plan.useCase),
    style: cleanText(plan.style),
    quantity: typeof plan.quantity === "number" ? plan.quantity : undefined,
    budget: plan.budget,
    attributeRequest: plan.attributeRequest,
    availabilityQuestion: Boolean(plan.availabilityQuestion),
    replyTone: plan.replyTone,
    suggestedActions: plan.suggestedActions?.slice(0, 4),
    recoveryActions: plan.recoveryActions?.slice(0, 3),
    reasonCodes: plan.reasonCodes?.slice(0, 6),
  };
}

export function plannerSearchQuery(plan: SalesPlan | null): string | undefined {
  const query = cleanText(plan?.searchQuery);
  if (query) return query;
  return [
    cleanText(plan?.material),
    cleanText(plan?.productType),
    cleanText(plan?.occasion),
    cleanText(plan?.style),
    cleanText(plan?.useCase),
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || undefined;
}

export function plannerFallbackQuestion(plan: SalesPlan | null): string | undefined {
  if (!plan?.missingSlot || plan.missingSlot === "none") return undefined;
  const singlish = plan.languageStyle === "singlish" || plan.languageStyle === "mixed";
  switch (plan.missingSlot) {
    case "budget":
      return singlish ? "Budget eka mokak wage da?" : "What budget should I stay within?";
    case "recipient":
      return singlish ? "Me gift eka kaatada?" : "Who is this for?";
    case "use_case":
      return singlish ? "Meka mokak sandahada?" : "What is this for?";
    case "style":
      return singlish ? "Style eka mokak wage da?" : "What style would you prefer?";
    case "quantity":
      return singlish ? "Keeyak wage oneda?" : "How many do you need?";
    default:
      return undefined;
  }
}

export function plannerSuggestedActions(plan: SalesPlan | null): WidgetAction[] {
  return (plan?.suggestedActions ?? [])
    .filter((action) => cleanText(action.label) && (cleanText(action.message) || cleanText(action.sku) || action.action))
    .slice(0, 4)
    .map((action) => ({
      type: action.type ?? "message",
      label: action.label.trim(),
      sku: cleanText(action.sku),
      action: action.action,
      message: cleanText(action.message) ?? (action.type === "message" || !action.type ? action.label.trim() : undefined),
    }));
}

export function plannerRecoveryActions(plan: SalesPlan | null): WidgetAction[] {
  return (plan?.recoveryActions ?? [])
    .filter((action) => cleanText(action.label) && cleanText(action.message))
    .slice(0, 3)
    .map((action) => ({ type: "message" as const, label: action.label.trim(), message: action.message.trim() }));
}

export function plannerProductResultsIntro(input: {
  plan: SalesPlan | null;
  productCount: number;
  scope?: string;
}): string | undefined {
  const { plan, productCount, scope } = input;
  const language = plan?.replyLanguage ?? plan?.languageStyle;
  if (!plan || !["singlish", "mixed", "sinhala"].includes(language ?? "")) return undefined;
  const count = productCount > 1 ? "options tikak" : "option ekak";
  return scope ? `${scope} walata match wena ${count} thiyenawa.` : `Match wena ${count} thiyenawa.`;
}

export function salesPlanToQualificationPatch(
  plan: SalesPlan | null,
  options?: { latestMessage?: string; catalogAliases?: Record<string, string[]>; catalogHints?: CatalogSearchHints }
): QualificationState {
  const patch: QualificationState = {};
  if (!plan) return patch;
  const catalogBandBudget = budgetFromCatalogPriceBandMessage(options?.latestMessage, options?.catalogHints);
  if (catalogBandBudget) {
    patch.budget = catalogBandBudget;
  } else if ((plan.budget?.min != null || plan.budget?.max != null) && budgetGroundedInLatestMessage(options?.latestMessage)) {
    patch.budget = plan.budget;
  }
  const recipient = slotValueGroundedInLatestMessage(plan.recipient, options?.latestMessage, options?.catalogAliases)
    ? cleanText(plan.recipient)
    : undefined;
  if (recipient) patch.recipient = recipient;
  if (typeof plan.quantity === "number" && Number.isFinite(plan.quantity) && plan.quantity > 0) patch.quantity = Math.floor(plan.quantity);

  const constraints = [
    plan.productType,
    plan.material,
    plan.occasion,
    plan.useCase,
    plan.style,
  ].filter((value): value is string =>
    slotValueGroundedInLatestMessage(value, options?.latestMessage, options?.catalogAliases)
  );
  const searchQuery = cleanText(plan.searchQuery);
  if (
    searchQuery &&
    plan.action === "search_products" &&
    slotValueGroundedInLatestMessage(searchQuery, options?.latestMessage, options?.catalogAliases)
  ) {
    constraints.push(searchQuery);
  }
  if (constraints.length) {
    const seen = new Map<string, string>();
    for (const constraint of constraints) seen.set(constraint.toLowerCase(), constraint);
    patch.constraints = [...seen.values()];
  }
  return patch;
}

export async function runSalesPlanner(input: {
  llm: LLMProvider | null;
  model: string;
  message: string;
  history?: StoredMessage[];
  qualification?: QualificationState;
  catalogHints?: CatalogSearchHints;
  fallback?: {
    intent: ChatIntent;
    subIntent: ChatSubIntent;
    funnelStage: FunnelStage;
    gateProductSearch?: boolean;
  };
  cartItemCount?: number;
  pageUrl?: string;
}): Promise<{ plan: SalesPlan | null; usage: { inputTokens: number; outputTokens: number } }> {
  const { llm, model, message, history, qualification, catalogHints, fallback, cartItemCount, pageUrl } = input;
  if (!llm) return { plan: null, usage: { inputTokens: 0, outputTokens: 0 } };

  try {
    const response = await llm.chat({
      model,
      temperature: 0.1,
      maxOutputTokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You are a multilingual commerce chat router and sales planning module for tenants that may sell products, services, or both. Return ONLY valid compact JSON. " +
            "You are the primary decision maker for intent, subIntent, funnelStage, next action, discovery gating, search query, and recovery strategy. " +
            "Choose exactly one action from ask_question, answer, search_products, compare_products, get_product_details, cart_action, handoff_suggested. " +
            "Choose userMove from new_request, budget_answer, recipient_answer, style_answer, use_case_answer, chip_selection, show_more, product_question, cart_reply, faq_question, greeting, unknown. " +
            "Choose attributeRequest from height, size, dimensions, color, material, stock, price, availability, none. Use none unless the latestMessage asks for a product attribute. " +
            "Choose closeIntent from none, product_interest, add_to_cart, checkout_ready. Use closeTarget with sku/name/confidence when the shopper refers to a recently shown product. " +
            "Choose intent from faq, product, checkout, greeting, unknown. Choose subIntent from product_browse, product_compare, product_detail, faq_policy, faq_objection, cart_review, checkout_ready, order_status. " +
            "Choose funnelStage from discover, compare, objection, cart, checkout. " +
            "Choose contextPolicy from continue, reset, show_more, narrow, recover. Choose resultPolicy from exact, diversify, exclude_seen, relax_constraints, ask_clarification. Choose responsePolicy from answer, ask_one_question, show_cards, recover, handoff. " +
            "Do not assume audiences, recipients, occasions, service types, or product types unless grounded in catalogHints or the latest message. " +
            "For broad requests, prefer ask_question until one useful missing slot is clear; for concrete offering phrases, search_products is allowed even without budget. " +
            "If latestMessage is a budget answer such as 'around 5000', '5000', 'under 7000', 'mid range', or a catalog price-band message and existingQualification has shopping context, set userMove:'budget_answer', action:'search_products', gateProductSearch:false, keep the existing shopping context, and set budget. Treat 'around/about/near N' as budget.max=N unless the user says above/from/over. " +
            "If latestMessage answers an audience/persona/use case for the current request, set userMove:'recipient_answer' or 'use_case_answer', keep existing context, and do not immediately broaden into unrelated offerings. If budget is missing and price matters for this tenant, ask for budget. If a generated decisionFactor is missing, ask one useful narrowing question. " +
            "If latestMessage asks for best/top products after you already asked a budget question and existingQualification has shopping context, treat it as progress: set action:'search_products', gateProductSearch:false, keep the current context, and do not repeat the same budget question. " +
            "If latestMessage says the shopper wants, likes, is interested in, wants to get/buy/order/book, or names a recently shown offering, treat it as close intent even with typos/transliteration: set closeIntent:'product_interest' or 'add_to_cart', closeTarget to the matching recent offering, userMove:'cart_reply', intent:'product' or 'checkout', subIntent:'product_detail' or 'checkout_ready', action:'search_products' unless a SKU is explicit, gateProductSearch:false, and confirm the matching offering. Do not suggest lower-value alternatives, ask for budget, or budget relaxation when the shopper is ready to buy/book a shown offering. " +
            "If latestMessage is a short suggested-action reply matching catalogHints offeringTypes, audiences, use cases, decision factors, or price bands, set userMove:'chip_selection' and choose search_products when enough context exists. " +
            "If latestMessage asks for more results such as 'what else do you have', 'anything else', 'show more', or 'more options', set userMove:'show_more', contextPolicy:'show_more', resultPolicy:'exclude_seen', action:'search_products', gateProductSearch:false, keep existing shopping context, and search for additional products instead of repeating the same products. If it says 'like this X' or 'looks like X', make X the active productType/searchQuery. " +
            "If latestMessage clearly starts a different product request, set userMove:'new_request', contextPolicy:'reset', resetContext:true, and build searchQuery only from the new request. " +
            "Be sales-skilled and engaging: suggestedActions should be useful next-click choices that move the shopper toward a purchase, not repeated generic chips. " +
            "Every suggestedActions item must include type:'message', a concise label, and the exact message the widget should send. " +
            "Match suggestedActions to the question. For yes/no questions, return exactly two useful choices such as Yes and No. For budget questions, prefer the catalog price-band choices. Do not pad every question to three choices. " +
            "For greeting/hello-only messages, answer warmly and make suggestedActions concrete tenant-specific starters from catalogHints.starterIntents, offeringTypes, useCaseProfiles, or categories; never use a vague question chip like 'What are you looking for?'. " +
            "For budget bands, use the catalogHints priceBands message text exactly, e.g. 'Show mid range options from ... to ...'. " +
            "When action is search_products, nextQuestion may be a short post-results sales question only if it helps narrow or close the sale; otherwise omit it. " +
            "Do not repeat a question already answered in recentHistory. If the latest message answers the most recent assistant question, treat it as progress, not a fresh vague browse. " +
            "Do not use action:'answer' to list offering recommendations from memory. For product/service recommendations, use search_products so the application can render grounded cards. " +
            "languageStyle and replyLanguage must describe the latestMessage only, not catalog/history language. If latestMessage is English, replyLanguage, nextQuestion, and suggestedActions must be English only. If latestMessage is Singlish/Sinhala/Tamil/mixed, replyLanguage and nextQuestion must match that style. " +
            "If the latest message asks product attributes like height, size, dimensions, colors, materials, price, or stock for the current product context, set userMove:'product_question', attributeRequest to the requested attribute, action:'search_products', gateProductSearch:false, and searchQuery from existingQualification/search context. Do not ask which size/height they want. " +
            "Tolerate minor typos like 'ahve' for 'have'. " +
            "Use tenant catalog hints when they match, especially offeringTypes, useCaseProfiles, audiences, decisionFactors, productTypeHints, attributeSummaries, and price coverage; do not invent unavailable specific offerings. " +
            "searchQuery must be a clean tenant catalog query, e.g. a product type, service package, or use case from the shopper wording. " +
            "Only include productType/material/occasion/recipient/useCase/style when the latest message states or clearly aliases that slot; do not copy old slots from existingQualification. " +
            "Treat 'no idea', 'not sure', and 'don't know' as uncertainty, not as product attributes or search terms. " +
            "confidence is 0..1; use lower confidence when language/catalog match is uncertain. " +
            "missingSlot is the single most important missing sales slot. resetContext is true only when the shopper clearly changed topic. " +
            "toolPolicy.allowedTools must include only tools needed for the chosen action. Never allow add_to_cart or create_checkout_link unless the shopper explicitly asks. " +
            "recoveryActions are suggested buttons when exact results fail; include premium_alternative when appropriate. " +
            "Schema: {confidence,languageStyle,replyLanguage,userMove,intent,subIntent,funnelStage,action,gateProductSearch,closeIntent,closeTarget,contextPolicy,resultPolicy,responsePolicy,searchQuery,ragQuery,toolPolicy,missingSlot,resetContext,productType,material,occasion,recipient,useCase,style,quantity,budget,attributeRequest,availabilityQuestion,nextQuestion,replyTone,suggestedActions,recoveryActions,reasonCodes}. " +
            "Use null/omit unknown fields. nextQuestion should ask the single most useful missing sales question in the user's language.",
        },
        {
          role: "user",
          content: JSON.stringify({
            latestMessage: message,
            recentHistory: (history ?? []).slice(-6).map((item) => ({
              role: item.role,
              content: item.content.slice(0, 300),
              surfacedProductSkus: Array.isArray(item.metadata?.surfacedProductSkus)
                ? item.metadata.surfacedProductSkus
                : undefined,
              surfacedProductNames: Array.isArray(item.metadata?.surfacedProductNames)
                ? item.metadata.surfacedProductNames
                : undefined,
            })),
            existingQualification: qualification ?? null,
            catalogHints: compactHints(catalogHints),
            fallback,
            cartItemCount: cartItemCount ?? 0,
            pageUrl,
          }),
        },
      ],
    });
    const parsed = parsePlanJson(response.content);
    if (parsed && !parsed.replyLanguage) parsed.replyLanguage = replyLanguageForLatestMessage(message, parsed.languageStyle);
    return { plan: normalizeChatPlan(parsed, fallback ?? {
      intent: "product",
      subIntent: "product_browse",
      funnelStage: "discover",
      gateProductSearch: false,
    }), usage: response.usage };
  } catch {
    return { plan: null, usage: { inputTokens: 0, outputTokens: 0 } };
  }
}
