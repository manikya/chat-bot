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
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function messageMentionsHint(message: string, hint: string): boolean {
  const normalizedMessage = normalizeHint(message);
  const normalizedHint = normalizeHint(hint);
  if (!normalizedHint) return false;
  return new RegExp(`(^|\\s)${normalizedHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(
    normalizedMessage
  );
}

function mentionsGift(message: string, qualification?: QualificationState): boolean {
  const lower = message.toLowerCase();
  if (qualification?.category === "gift") return true;
  return /\b(gift|gifts|father'?s day|mother'?s day|birthday|anniversary|wedding|housewarming)\b/i.test(lower);
}

function mentionsEvent(message: string, qualification?: QualificationState): boolean {
  const lower = message.toLowerCase();
  return (
    qualification?.constraints?.some((c) => /corporate|cooperate|event|giveaway|decor|award/i.test(c)) ??
    false
  ) || qualification?.category === "event" || /\b(corporate|cooperate|event|giveaways?|decor|awards?)\b/i.test(lower);
}

function hasSpecificEventUseCase(qualification?: QualificationState): boolean {
  return Boolean(
    qualification?.constraints?.some((c) => /giveaway|decor|award|appreciation/i.test(c)) ||
      (qualification?.category && /giveaway|decor|award|appreciation/i.test(qualification.category))
  );
}

function hasUseCase(qualification?: QualificationState): boolean {
  return Boolean(
    qualification?.category ||
      qualification?.recipient ||
      qualification?.constraints?.some((c) => /gift|corporate|cooperate|event|giveaway|decor|award|personal/i.test(c))
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

function fallbackBudgetActions(market: ChatMarket): WidgetAction[] {
  if (market === "lk") {
    return [
      { type: "message", label: "Under LKR 3,000", message: "My budget is under LKR 3,000" },
      { type: "message", label: "LKR 3,000-5,000", message: "My budget is LKR 3,000 to LKR 5,000" },
      { type: "message", label: "Above LKR 5,000", message: "Budget is above LKR 5,000" },
    ];
  }
  return [
    { type: "message", label: "Under $50", message: "My budget is under $50" },
    { type: "message", label: "$50-$100", message: "My budget is $50 to $100" },
    { type: "message", label: "Above $100", message: "Budget is above $100" },
  ];
}

function budgetActions(market: ChatMarket, catalogHints?: CatalogSearchHints): WidgetAction[] {
  if (catalogHints?.priceBands?.length) {
    return catalogHints.priceBands.slice(0, 3).map((band) => ({
      type: "message" as const,
      label: band.label,
      message: band.message,
    }));
  }
  return fallbackBudgetActions(market);
}

function recipientActions(message: string, catalogHints?: CatalogSearchHints): WidgetAction[] | undefined {
  const matchedOccasion = catalogHints?.occasions?.find((occasion) => messageMentionsHint(message, occasion));
  const messageHasOccasion = /\b(father'?s day|mother'?s day|birthday|anniversary|wedding|housewarming)\b/i.test(message);
  if (messageHasOccasion && !matchedOccasion) return undefined;
  const recipients = matchedOccasion
    ? catalogHints?.occasionRecipients?.[matchedOccasion] ?? catalogHints?.recipients
    : catalogHints?.recipients;
  const unique = [...new Set((recipients ?? []).map((recipient) => recipient.trim()).filter(Boolean))].slice(0, 3);
  if (!unique.length) return undefined;
  return unique.map((recipient) => ({
    type: "message" as const,
    label: `For ${recipient}`,
    message: `It's for ${recipient}`,
  }));
}

function messageAction(label: string, message: string): WidgetAction {
  return { type: "message", label, message };
}

function hintActions(values: string[] | undefined, prefix: string, max = 3): WidgetAction[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
    .slice(0, max)
    .map((value) => messageAction(value, `${prefix} ${value}`));
}

function shoppingIntentActions(catalogHints?: CatalogSearchHints): WidgetAction[] | undefined {
  const actions = [
    ...hintActions(catalogHints?.occasions, "I'm shopping for", 2),
    ...hintActions(catalogHints?.categories, "Show me", 3),
  ];
  return actions.length ? actions.slice(0, 3) : undefined;
}

function eventUseCaseActions(catalogHints?: CatalogSearchHints): WidgetAction[] | undefined {
  const candidates = [
    ...(catalogHints?.useCases ?? []),
    ...(catalogHints?.occasions ?? []),
    ...(catalogHints?.tags ?? []),
  ].filter((value) => /event|giveaway|decor|award|appreciation|corporate|cooperate/i.test(value));
  const actions = hintActions(candidates, "It's for", 3);
  return actions.length ? actions : undefined;
}

function styleActions(recipient?: string): WidgetAction[] {
  const suffix = recipient ? ` for ${recipient}` : "";
  return [
    { type: "message", label: "Popular picks", message: `Show popular options${suffix}` },
    { type: "message", label: "Something premium", message: `Show premium options${suffix}` },
    { type: "message", label: "Budget-friendly", message: `Show budget-friendly options${suffix}` },
  ];
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

  const giftLike = mentionsGift(message, qualification);
  const eventLike = mentionsEvent(message, qualification);
  const budget = budgetLabel(qualification, market);
  const recipient = qualification?.recipient;

  if (gateProductSearch && giftLike && !recipient) {
    const actions = recipientActions(message, catalogHints);
    return {
      move: "ask_recipient",
      reply: budget
        ? `Got it, ${budget}. Who is it for?`
        : "Sure, I can help with that. Who is it for?",
      suggestedActions: actions,
    };
  }

  if (gateProductSearch && eventLike && !hasSpecificEventUseCase(qualification)) {
    const actions = eventUseCaseActions(catalogHints);
    return {
      move: "ask_use_case",
      reply: actions?.length
        ? "Sure, what is this for at the event?"
        : "Sure, what is this for at the event: giveaways, table decor, or awards/appreciation gifts?",
      suggestedActions: actions,
    };
  }

  if (gateProductSearch && !hasUseCase(qualification) && !eventLike && !giftLike) {
    const actions = shoppingIntentActions(catalogHints);
    return {
      move: "ask_use_case",
      reply: actions?.length
        ? "Sure, what are you shopping for?"
        : "Sure, what are you shopping for: a gift, an event, or personal use?",
      suggestedActions: actions,
    };
  }

  if (gateProductSearch && !budget) {
    return {
      move: "ask_budget",
      reply: recipient
        ? `Nice, for ${recipient}. What budget should I stay within?`
        : "Sure. What budget should I stay within?",
      suggestedActions: budgetActions(market, catalogHints),
    };
  }

  if (!gateProductSearch && giftLike && recipient && budget && !qualification?.constraints?.length) {
    return {
      move: "ask_style",
      suggestedActions: styleActions(recipient),
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
  if (qualification?.constraints?.length) {
    parts.push(`matching ${qualification.constraints.slice(0, 2).join(", ")}`);
  }
  if (qualification?.category && qualification.category !== "gift") parts.push(`in ${qualification.category}`);

  const count = productCount > 1 ? "a few options" : "an option";
  if (!parts.length) return `I found ${count} that are in stock and easy to choose from.`;
  return `I found ${count} ${parts.join(" ")} that are in stock.`;
}
