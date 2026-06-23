import type { ChatIntent, FunnelStage, QualificationState } from "@commercechat/shared";
import { messageMentionsProducts } from "./intent";
import { LK_CHECKOUT_KEYWORDS, LK_OBJECTION_KEYWORDS } from "./locale";

const FUNNEL_STAGES: FunnelStage[] = ["discover", "compare", "objection", "cart", "checkout"];

export function normalizeFunnelStage(stage?: string | null): FunnelStage {
  if (stage && FUNNEL_STAGES.includes(stage as FunnelStage)) {
    return stage as FunnelStage;
  }
  return "discover";
}

export interface FunnelResolveInput {
  message: string;
  intent: ChatIntent;
  currentStage?: FunnelStage | string;
  cartItemCount: number;
}

export interface FunnelContext {
  stage: FunnelStage;
  previousStage: FunnelStage;
  changed: boolean;
  qualification: QualificationState;
}

const COMPARE_PATTERNS = [
  /\bwhich (one|is better|should i)\b/i,
  /\bcompare\b/i,
  /\bvs\.?\b/i,
  /\bdifference between\b/i,
  /\bor\b.+\bor\b/i,
];

export function messageSignalsCompare(message: string): boolean {
  const trimmed = message.trim();
  if (COMPARE_PATTERNS.some((p) => p.test(trimmed))) return true;
  const skuLike = trimmed.match(/\b[A-Z0-9][A-Z0-9_-]{2,}\b/g);
  return (skuLike?.length ?? 0) >= 2;
}

export function messageSignalsObjection(message: string): boolean {
  const lower = message.toLowerCase();
  return LK_OBJECTION_KEYWORDS.some((k) => lower.includes(k));
}

export function resolveNextFunnelStage(input: FunnelResolveInput): FunnelStage {
  const current = normalizeFunnelStage(input.currentStage);
  const { message, intent, cartItemCount } = input;
  const lower = message.toLowerCase();
  const wantsProducts = intent === "product" || messageMentionsProducts(message);
  const wantsCheckout =
    intent === "checkout" || LK_CHECKOUT_KEYWORDS.some((k) => lower.includes(k));
  const isObjection = messageSignalsObjection(message);
  const isCompare = messageSignalsCompare(message);

  if (isObjection && (intent === "faq" || intent === "product" || intent === "checkout")) {
    return "objection";
  }

  if (cartItemCount > 0) {
    if (wantsCheckout) return "checkout";
    if (wantsProducts && current === "checkout") return "compare";
    return "cart";
  }

  if (wantsCheckout) return "checkout";

  if (isCompare || (wantsProducts && current === "compare")) return "compare";

  if (wantsProducts) {
    if (current === "objection") return "discover";
    return current === "discover" ? "discover" : current;
  }

  if (intent === "greeting") return "discover";

  if (current === "checkout" && wantsProducts) return "compare";

  return current;
}

export function resolveFunnelContext(
  conversation: { funnelStage?: string; qualification?: QualificationState },
  input: Omit<FunnelResolveInput, "currentStage">
): FunnelContext {
  const previousStage = normalizeFunnelStage(conversation.funnelStage);
  const stage = resolveNextFunnelStage({
    ...input,
    currentStage: previousStage,
  });
  return {
    stage,
    previousStage,
    changed: stage !== previousStage,
    qualification: conversation.qualification ?? {},
  };
}

export function funnelStageLabel(stage: FunnelStage): string {
  switch (stage) {
    case "discover":
      return "Discover";
    case "compare":
      return "Compare";
    case "objection":
      return "Objection";
    case "cart":
      return "Cart";
    case "checkout":
      return "Checkout";
  }
}
