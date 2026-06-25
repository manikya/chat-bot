import type { QualificationState } from "@commercechat/shared";
import type { WidgetAction } from "@commercechat/shared";
import type { CatalogSearchHints } from "../catalog/products";
import type { LLMProvider } from "../llm/types";
import type { StoredMessage } from "./conversation";

export const PLANNER_CONFIDENCE_THRESHOLD = 0.55;

export interface SalesPlan {
  confidence?: number;
  languageStyle?: "english" | "sinhala" | "tamil" | "singlish" | "mixed" | "unknown";
  intent?: "product_search" | "gift" | "event" | "faq" | "checkout" | "unknown";
  searchQuery?: string;
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
  availabilityQuestion?: boolean;
  nextQuestion?: string;
  replyTone?: "concise" | "consultative" | "premium" | "friendly";
  recoveryActions?: Array<{
    label: string;
    message: string;
    strategy?: "relax_budget" | "relax_material" | "premium_alternative" | "closest_category" | "ask_clarification";
  }>;
}

function compactHints(catalogHints?: CatalogSearchHints) {
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

function normalizeGroundingText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function isUnknownSlotValue(value: string): boolean {
  return /^(?:unknown|unsure|not sure|no idea|dont know|don't know|anything|any|none)$/i.test(value.trim());
}

function messageContainsSlotValue(message: string, value: string): boolean {
  const normalizedMessage = normalizeGroundingText(message);
  const normalizedValue = normalizeGroundingText(value);
  if (!normalizedMessage || !normalizedValue) return false;
  return new RegExp(`(^|\\s)${normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i").test(
    normalizedMessage
  );
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
  return /\b(?:rs\.?|lkr|usd|\$|€|£)?\s*\d[\d,]*(?:\.\d+)?\s*(?:k|lkr|rs)?\b/i.test(latestMessage) ||
    /\b(under|below|less than|max|upto|up to|within|over|above|at least|from|budget|premium|mid range|budget[-\s]?friendly|affordable|cheap|luxury)\b/i.test(latestMessage);
}

export function plannerConfidence(plan: SalesPlan | null): number {
  const confidence = Number(plan?.confidence ?? 0);
  return Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
}

export function trustedSalesPlan(plan: SalesPlan | null): SalesPlan | null {
  if (!plan) return null;
  return plannerConfidence(plan) >= PLANNER_CONFIDENCE_THRESHOLD ? plan : null;
}

export function publicSalesPlan(plan: SalesPlan | null) {
  if (!plan) return null;
  return {
    confidence: plannerConfidence(plan),
    trusted: plannerConfidence(plan) >= PLANNER_CONFIDENCE_THRESHOLD,
    languageStyle: plan.languageStyle,
    intent: plan.intent,
    searchQuery: cleanText(plan.searchQuery),
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
    availabilityQuestion: Boolean(plan.availabilityQuestion),
    replyTone: plan.replyTone,
    recoveryActions: plan.recoveryActions?.slice(0, 3),
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
  if (!plan || !["singlish", "mixed"].includes(plan.languageStyle ?? "")) return undefined;
  const count = productCount > 1 ? "options tikak" : "option ekak";
  return scope ? `${scope} walata match wena ${count} thiyenawa.` : `Match wena ${count} thiyenawa.`;
}

export function salesPlanToQualificationPatch(
  plan: SalesPlan | null,
  options?: { latestMessage?: string; catalogAliases?: Record<string, string[]> }
): QualificationState {
  const patch: QualificationState = {};
  if (!plan) return patch;
  if ((plan.budget?.min != null || plan.budget?.max != null) && budgetGroundedInLatestMessage(options?.latestMessage)) {
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
  if (constraints.length) {
    const seen = new Map<string, string>();
    for (const constraint of constraints) seen.set(constraint.toLowerCase(), constraint);
    patch.constraints = [...seen.values()];
  }
  if (plan.intent === "gift" && /\b(gifts?|birthday|anniversary|wedding|housewarming|father'?s day|mother'?s day)\b/i.test(options?.latestMessage ?? "")) {
    patch.category = "gift";
  }
  if (plan.intent === "event" && /\b(corporate|cooperate|event|giveaways?|awards?|appreciation)\b/i.test(options?.latestMessage ?? "")) {
    patch.category = "event";
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
}): Promise<{ plan: SalesPlan | null; usage: { inputTokens: number; outputTokens: number } }> {
  const { llm, model, message, history, qualification, catalogHints } = input;
  if (!llm) return { plan: null, usage: { inputTokens: 0, outputTokens: 0 } };

  try {
    const response = await llm.chat({
      model,
      temperature: 0.1,
      maxOutputTokens: 350,
      messages: [
        {
          role: "system",
          content:
            "You are a multilingual ecommerce sales planning module. Return ONLY valid compact JSON. " +
            "Infer the shopper's natural language style and shopping slots from the latest message. " +
            "Do not assume recipient from occasions like Father's Day or Mother's Day. " +
            "If the user asks in Singlish/Sinhala/Tamil/mixed language, nextQuestion must match that style. " +
            "Use tenant catalog hints when they match, but do not invent unavailable specific products. " +
            "searchQuery must be a clean product catalog query, e.g. 'brass oil lamp' from Singlish/Sinhala wording. " +
            "Only include productType/material/occasion/recipient/useCase/style when the latest message states or clearly aliases that slot; do not copy old slots from existingQualification. " +
            "Treat 'no idea', 'not sure', and 'don't know' as uncertainty, not as product attributes or search terms. " +
            "confidence is 0..1; use lower confidence when language/catalog match is uncertain. " +
            "missingSlot is the single most important missing sales slot. resetContext is true only when the shopper clearly changed topic. " +
            "recoveryActions are suggested buttons when exact results fail; include premium_alternative when appropriate. " +
            "Schema: {confidence,languageStyle,intent,searchQuery,missingSlot,resetContext,productType,material,occasion,recipient,useCase,style,quantity,budget,availabilityQuestion,nextQuestion,replyTone,recoveryActions}. " +
            "Use null/omit unknown fields. nextQuestion should ask the single most useful missing sales question in the user's language.",
        },
        {
          role: "user",
          content: JSON.stringify({
            latestMessage: message,
            recentHistory: (history ?? []).slice(-6).map((item) => ({
              role: item.role,
              content: item.content.slice(0, 300),
            })),
            existingQualification: qualification ?? null,
            catalogHints: compactHints(catalogHints),
          }),
        },
      ],
    });
    return { plan: parsePlanJson(response.content), usage: response.usage };
  } catch {
    return { plan: null, usage: { inputTokens: 0, outputTokens: 0 } };
  }
}
