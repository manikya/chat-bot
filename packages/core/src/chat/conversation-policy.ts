import type { ChatIntent, ChatSubIntent, FunnelStage, QualificationState, WidgetAction } from "@commercechat/shared";
import { formatMoney, type ChatMarket } from "./locale";
import type { CatalogSearchHints } from "../catalog/products";

export type ConversationMove =
  | "ask_recipient"
  | "ask_budget"
  | "ask_use_case"
  | "ask_style"
  | "show_products"
  | "continue";

export interface ConversationPolicy {
  move: ConversationMove;
  reply?: string;
  suggestedActions?: WidgetAction[];
}

function normalizeHint(value: string): string {
  let output = "";
  let previousWasSpace = true;
  for (const char of value.toLowerCase()) {
    const code = char.charCodeAt(0);
    const isWordChar = (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
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

function messageMentionsHint(message: string, hint: string): boolean {
  const normalizedMessage = normalizeHint(message);
  const normalizedHint = normalizeHint(hint);
  if (!normalizedHint) return false;
  return ` ${normalizedMessage} `.includes(` ${normalizedHint} `);
}

function messageMentionsAny(message: string, terms: string[]): boolean {
  return terms.some((term) => messageMentionsHint(message, term));
}

function generatedTerms(catalogHints?: CatalogSearchHints): string[] {
  return [
    ...(catalogHints?.offeringTypes ?? []),
    ...(catalogHints?.useCases ?? []),
    ...(catalogHints?.occasions ?? []),
    ...(catalogHints?.audiences ?? []),
    ...(catalogHints?.recipients ?? []),
  ];
}

function mentionsGeneratedFlow(message: string, qualification?: QualificationState, catalogHints?: CatalogSearchHints): boolean {
  const terms = generatedTerms(catalogHints);
  return (
    qualification?.category === "gift" ||
    qualification?.category === "event" ||
    Boolean(qualification?.recipient) ||
    qualification?.constraints?.some((c) => messageMentionsAny(c, terms)) ||
    messageMentionsAny(message, terms)
  );
}

function mentionsGeneratedUseCase(message: string, qualification?: QualificationState, catalogHints?: CatalogSearchHints): boolean {
  const useCaseTerms = [
    ...(catalogHints?.useCases ?? []),
    ...(catalogHints?.occasions ?? []),
    ...Object.keys(catalogHints?.useCaseProfiles ?? {}),
  ];
  return (
    qualification?.constraints?.some((c) => messageMentionsAny(c, useCaseTerms)) ??
    false
  ) || messageMentionsAny(qualification?.category ?? "", useCaseTerms) || messageMentionsAny(message, useCaseTerms);
}

function hasSpecificUseCase(qualification?: QualificationState, catalogHints?: CatalogSearchHints): boolean {
  const useCaseTerms = [
    ...(catalogHints?.useCases ?? []),
    ...Object.keys(catalogHints?.useCaseProfiles ?? {}),
  ];
  return Boolean(
    qualification?.constraints?.some((c) => messageMentionsAny(c, useCaseTerms)) ||
      (qualification?.category && messageMentionsAny(qualification.category, useCaseTerms))
  );
}

function hasUseCase(qualification?: QualificationState): boolean {
  return Boolean(
    qualification?.category ||
      qualification?.recipient ||
      qualification?.constraints?.some((c) => !isPriceTierPhrase(c))
  );
}

function budgetLabel(qualification?: QualificationState, market: ChatMarket = "default"): string | null {
  const budget = qualification?.budget;
  if (!budget?.max && !budget?.min) return null;
  const currency = market === "lk" ? "LKR" : "USD";
  if (budget.max != null) return `under ${formatMoney(budget.max, currency)}`;
  if (budget.min != null) return `above ${formatMoney(budget.min, currency)}`;
  return null;
}

function uniquePhraseParts(parts: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const part of parts) {
    const value = part?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(value);
  }
  return clean;
}

function isPriceTierPhrase(value: string): boolean {
  return ["budget", "budget friendly", "mid range", "premium", "premium picks", "luxury"].includes(normalizeHint(value));
}

function priceBandsForQualification(catalogHints?: CatalogSearchHints, qualification?: QualificationState) {
  const terms = [qualification?.category, ...(qualification?.constraints ?? [])].map((term) => term?.trim()).filter(Boolean) as string[];
  for (const term of terms) {
    const materialBands = catalogHints?.priceBandsByMaterial?.[term];
    if (materialBands?.length) return materialBands;
    const categoryBands = catalogHints?.priceBandsByCategory?.[term];
    if (categoryBands?.length) return categoryBands;
  }
  return catalogHints?.priceBands;
}

function budgetActions(catalogHints?: CatalogSearchHints, qualification?: QualificationState): WidgetAction[] {
  const bands = priceBandsForQualification(catalogHints, qualification);
  if (bands?.length) {
    return bands.slice(0, 3).map((band) => ({
      type: "message" as const,
      label: band.label,
      message: band.message,
    }));
  }
  return [];
}

function recipientActions(message: string, catalogHints?: CatalogSearchHints): WidgetAction[] | undefined {
  const matchedOccasion = catalogHints?.occasions?.find((occasion) => messageMentionsHint(message, occasion));
  const messageHasOccasion = Boolean(matchedOccasion);
  const recipients = matchedOccasion
    ? catalogHints?.occasionRecipients?.[matchedOccasion] ?? catalogHints?.audiences ?? catalogHints?.recipients
    : catalogHints?.audiences?.length
      ? catalogHints.audiences
      : catalogHints?.recipients;
  const unique = [...new Set((recipients ?? []).map((recipient) => recipient.trim()).filter(Boolean))].slice(0, 3);
  if (!unique.length) return messageHasOccasion ? [{ type: "message" as const, label: "Someone else", message: "It's for someone else" }] : undefined;
  return [
    ...unique.map((recipient) => ({
      type: "message" as const,
      label: `For ${recipient}`,
      message: `It's for ${recipient}`,
    })),
    ...(messageHasOccasion ? [{ type: "message" as const, label: "Someone else", message: "It's for someone else" }] : []),
  ].slice(0, 4);
}

function recipientQuestion(_message: string, budget?: string): string {
  const prefix = budget ? `Got it, ${budget}.` : "Sure, I can help with that.";
  return budget ? `${prefix} Who is this for?` : "Sure, I can help with that. Who is this for?";
}

function messageAction(label: string, message: string): WidgetAction {
  return { type: "message", label, message };
}

function hintActions(values: string[] | undefined, prefix: string, max = 3): WidgetAction[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
    .slice(0, max)
    .map((value) => messageAction(value, prefix ? `${prefix} ${value}` : value));
}

function shoppingIntentActions(catalogHints?: CatalogSearchHints): WidgetAction[] | undefined {
  const actions = [
    ...hintActions(catalogHints?.starterIntents, "", 3),
    ...hintActions(catalogHints?.offeringTypes, "Show me", 3),
    ...hintActions(catalogHints?.categories, "Show me", 3),
  ];
  return actions.length ? actions.slice(0, 3) : undefined;
}

function useCaseActions(catalogHints?: CatalogSearchHints): WidgetAction[] | undefined {
  const candidates = [
    ...(catalogHints?.useCases ?? []),
    ...Object.keys(catalogHints?.useCaseProfiles ?? {}),
    ...(catalogHints?.decisionFactors ?? []),
  ];
  const actions = hintActions(candidates, "It's for", 3);
  return actions.length ? actions : undefined;
}

function decisionFactorActions(catalogHints?: CatalogSearchHints, recipient?: string): WidgetAction[] {
  const suffix = recipient ? ` for ${recipient}` : "";
  const factors = catalogHints?.decisionFactors?.filter((factor) => normalizeHint(factor) !== "budget").slice(0, 3) ?? [];
  if (factors.length) return factors.map((factor) => messageAction(factor, `Narrow by ${factor}${suffix}`));
  return [messageAction("Popular options", `Show popular options${suffix}`)];
}

export function planConversationMove(input: {
  message: string;
  intent: ChatIntent;
  subIntent?: ChatSubIntent;
  funnelStage?: FunnelStage;
  qualification?: QualificationState;
  gateProductSearch?: boolean;
  market?: ChatMarket;
  catalogHints?: CatalogSearchHints;
}): ConversationPolicy {
  const {
    message,
    intent,
    subIntent,
    funnelStage,
    qualification,
    gateProductSearch,
    market = "default",
    catalogHints,
  } = input;

  if (intent !== "product" && subIntent !== "product_browse") return { move: "continue" };
  if (!gateProductSearch && funnelStage && funnelStage !== "discover") return { move: "continue" };

  const generatedFlow = mentionsGeneratedFlow(message, qualification, catalogHints);
  const useCaseLike = mentionsGeneratedUseCase(message, qualification, catalogHints);
  const budget = budgetLabel(qualification, market);
  const recipient = qualification?.recipient;

  if (gateProductSearch && generatedFlow && !recipient && (catalogHints?.audiences?.length || catalogHints?.recipients?.length)) {
    const actions = recipientActions(message, catalogHints);
    return {
      move: "ask_recipient",
      reply: recipientQuestion(message, budget ?? undefined),
      suggestedActions: actions,
    };
  }

  if (gateProductSearch && useCaseLike && !hasSpecificUseCase(qualification, catalogHints)) {
    const actions = useCaseActions(catalogHints);
    return {
      move: "ask_use_case",
      reply: actions?.length
        ? "Sure, what is this for?"
        : "Sure, what should I help you narrow by?",
      suggestedActions: actions,
    };
  }

  if (gateProductSearch && !hasUseCase(qualification) && !useCaseLike && !generatedFlow) {
    const actions = shoppingIntentActions(catalogHints);
    return {
      move: "ask_use_case",
      reply: actions?.length
        ? "Sure, what are you shopping for?"
        : "Sure, what are you looking for?",
      suggestedActions: actions,
    };
  }

  if (gateProductSearch && !budget) {
    return {
      move: "ask_budget",
      reply: recipient
        ? `Nice, for ${recipient}. What budget should I stay within?`
        : "Sure. What budget should I stay within?",
      suggestedActions: budgetActions(catalogHints, qualification),
    };
  }

  if (!gateProductSearch && generatedFlow && recipient && budget && !qualification?.constraints?.length) {
    return {
      move: "ask_style",
      suggestedActions: decisionFactorActions(catalogHints, recipient),
    };
  }

  return { move: gateProductSearch ? "ask_budget" : "show_products" };
}

export function buildProductResultsIntro(input: {
  qualification?: QualificationState;
  productCount: number;
  market?: ChatMarket;
}): string {
  const { qualification, productCount, market = "default" } = input;
  const parts: string[] = [];
  if (qualification?.recipient) parts.push(`for ${qualification.recipient}`);
  const budget = budgetLabel(qualification, market);
  if (budget) parts.push(budget);
  const constraintParts = uniquePhraseParts(qualification?.constraints ?? [])
    .filter((part) => !isPriceTierPhrase(part))
    .slice(0, 2);
  if (constraintParts.length) parts.push(`matching ${constraintParts.join(", ")}`);
  const category = qualification?.category;
  if (category && category !== "gift" && !constraintParts.some((part) => part.toLowerCase() === category.toLowerCase())) {
    parts.push(`in ${category}`);
  }

  const count = productCount > 1 ? "a few options" : "an option";
  if (!parts.length) return `I found ${count} that are in stock and easy to choose from.`;
  return `I found ${count} ${parts.join(" ")} that are in stock.`;
}
