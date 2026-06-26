import type { ChatIntent, FunnelStage, QualificationState } from "@commercechat/shared";
import { LK_OBJECTION_KEYWORDS } from "./locale";

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

function normalizeText(value: string): string {
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

function containsPhrase(message: string, phrase: string): boolean {
  return ` ${normalizeText(message)} `.includes(` ${normalizeText(phrase)} `);
}

function skuLikeWordCount(message: string): number {
  return normalizeText(message)
    .split(" ")
    .filter((word) => word.length >= 3 && [...word].some((char) => {
      const code = char.charCodeAt(0);
      return code >= 48 && code <= 57;
    }))
    .length;
}

export function messageSignalsCompare(message: string): boolean {
  if (["which one", "is better", "should i", "compare", "vs", "difference between"].some((phrase) => containsPhrase(message, phrase))) return true;
  const normalized = normalizeText(message);
  return containsPhrase(normalized, "or") && normalized.indexOf(" or ") !== normalized.lastIndexOf(" or ") || skuLikeWordCount(message) >= 2;
}

export function messageSignalsObjection(message: string): boolean {
  const lower = message.toLowerCase();
  return LK_OBJECTION_KEYWORDS.some((k) => lower.includes(k));
}

export function resolveNextFunnelStage(input: FunnelResolveInput): FunnelStage {
  const current = normalizeFunnelStage(input.currentStage);
  const { intent, cartItemCount } = input;
  const wantsProducts = intent === "product";
  const wantsCheckout = intent === "checkout";

  if (cartItemCount > 0) {
    if (wantsCheckout) return "checkout";
    if (wantsProducts && current === "checkout") return "compare";
    return "cart";
  }

  if (wantsCheckout) return "checkout";

  if (wantsProducts && current === "compare") return "compare";

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
