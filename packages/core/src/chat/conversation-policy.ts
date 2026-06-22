import type { ChatIntent, ChatSubIntent, FunnelStage, QualificationState, WidgetAction } from "@commercechat/shared";
import { formatMoney, type ChatMarket } from "./locale";

export type ConversationMove =
  | "ask_recipient"
  | "ask_budget"
  | "ask_style"
  | "show_products"
  | "continue";

export interface ConversationPolicy {
  move: ConversationMove;
  reply?: string;
  suggestedActions?: WidgetAction[];
}

function mentionsGift(message: string, qualification?: QualificationState): boolean {
  const lower = message.toLowerCase();
  if (qualification?.category === "gift") return true;
  return /\b(gift|gifts|father'?s day|mother'?s day|birthday|anniversary|wedding|housewarming)\b/i.test(lower);
}

function budgetLabel(qualification?: QualificationState, market: ChatMarket = "default"): string | null {
  const budget = qualification?.budget;
  if (!budget?.max && !budget?.min) return null;
  const currency = market === "lk" ? "LKR" : "USD";
  if (budget.max != null) return `under ${formatMoney(budget.max, currency)}`;
  if (budget.min != null) return `above ${formatMoney(budget.min, currency)}`;
  return null;
}

function budgetActions(market: ChatMarket): WidgetAction[] {
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

function recipientActions(): WidgetAction[] {
  return [
    { type: "message", label: "For dad", message: "It's for my dad" },
    { type: "message", label: "For mom", message: "It's for my mom" },
    { type: "message", label: "For a friend", message: "It's for a friend" },
  ];
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
}): ConversationPolicy {
  const {
    message,
    intent,
    subIntent,
    funnelStage,
    qualification,
    gateProductSearch,
    market = "default",
  } = input;

  if (intent !== "product" && subIntent !== "product_browse") return { move: "continue" };
  if (funnelStage && funnelStage !== "discover") return { move: "continue" };

  const giftLike = mentionsGift(message, qualification);
  const budget = budgetLabel(qualification, market);
  const recipient = qualification?.recipient;

  if (gateProductSearch && giftLike && !recipient) {
    return {
      move: "ask_recipient",
      reply: budget
        ? `Got it, ${budget}. Who is it for?`
        : "Sure, I can help with that. Who is it for?",
      suggestedActions: recipientActions(),
    };
  }

  if (gateProductSearch && !budget) {
    return {
      move: "ask_budget",
      reply: recipient
        ? `Nice, for ${recipient}. What budget should I stay within?`
        : "Sure. What budget should I stay within?",
      suggestedActions: budgetActions(market),
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
  if (qualification?.category && qualification.category !== "gift") parts.push(`in ${qualification.category}`);

  const count = productCount > 1 ? "a few options" : "an option";
  if (!parts.length) return `I found ${count} that match.`;
  return `I found ${count} ${parts.join(" ")}.`;
}
