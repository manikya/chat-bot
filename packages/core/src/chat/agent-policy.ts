import type { WidgetAction } from "@commercechat/shared";
import type { ToolDefinition } from "../llm/types";
import type { AgentTurnState } from "./agent-state";
import type { ChatPlanAction } from "./sales-planner";

export interface AgentPolicyResult {
  gateProductSearch: boolean;
  planAction?: ChatPlanAction;
  excludeSkus: string[];
  flags: string[];
}

function normalized(value?: string): string {
  const parts: string[] = [];
  let current = "";
  for (const char of (value ?? "").toLowerCase()) {
    const code = char.charCodeAt(0);
    const isAsciiLetterOrDigit = (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
    if (isAsciiLetterOrDigit) {
      current += char;
    } else if (current) {
      parts.push(current);
      current = "";
    }
  }
  if (current) parts.push(current);
  return parts.join(" ");
}

function closeIntentAllowsCartTools(state: AgentTurnState): boolean {
  return state.planner?.closeIntent === "add_to_cart" || state.planner?.closeIntent === "checkout_ready";
}

function hasCloseIntent(state: AgentTurnState): boolean {
  return Boolean(state.planner?.closeIntent && state.planner.closeIntent !== "none");
}

function recipientAnswerWithoutBudget(state: AgentTurnState): boolean {
  return (
    state.userMove === "recipient_answer" &&
    state.intent === "product" &&
    !state.qualification.budget?.min &&
    !state.qualification.budget?.max
  );
}

export function applyAgentPolicy(input: {
  state: AgentTurnState;
  gateProductSearch: boolean;
  planAction?: ChatPlanAction;
}): AgentPolicyResult {
  const flags: string[] = [];
  let gateProductSearch = input.gateProductSearch;
  let planAction = input.planAction;
  let excludeSkus: string[] = [];

  if (input.state.resetContext) {
    excludeSkus = [];
    flags.push("context_reset");
  }

  if (
    input.state.userMove === "show_more" ||
    input.state.planner?.contextPolicy === "show_more" ||
    input.state.planner?.resultPolicy === "exclude_seen"
  ) {
    gateProductSearch = false;
    planAction = "search_products";
    excludeSkus = input.state.memory.recentProductSkus;
    if (excludeSkus.length) flags.push("exclude_recent_products");
  }

  if (hasCloseIntent(input.state) && input.state.intent === "product") {
    gateProductSearch = false;
    planAction = "search_products";
    excludeSkus = [];
    flags.push("purchase_intent_product_confirmation");
  }

  if (planAction === "cart_action" && !closeIntentAllowsCartTools(input.state)) {
    planAction = input.state.intent === "product" ? "search_products" : "answer";
    flags.push("blocked_unrequested_cart_action");
  }

  if (recipientAnswerWithoutBudget(input.state)) {
    gateProductSearch = true;
    planAction = "ask_question";
    flags.push("recipient_answer_requires_budget");
  }

  if (gateProductSearch && planAction === "search_products") {
    planAction = "ask_question";
    flags.push("search_blocked_by_discovery_gate");
  }

  return { gateProductSearch, planAction, excludeSkus, flags };
}

export function filterToolsByAgentPolicy(tools: ToolDefinition[], state: AgentTurnState): { tools: ToolDefinition[]; flags: string[] } {
  const flags: string[] = [];
  if (closeIntentAllowsCartTools(state)) return { tools, flags };

  const filtered = tools.filter((tool) => !["add_to_cart", "create_checkout_link"].includes(tool.name));
  if (filtered.length !== tools.length) flags.push("removed_unrequested_cart_tools");
  return { tools: filtered, flags };
}

function actionKey(action: WidgetAction): string {
  return normalized([action.type, action.label, action.message, action.sku, action.action].filter(Boolean).join(" "));
}

function looksLikeLanguageMismatch(action: WidgetAction, replyLanguage?: AgentTurnState["replyLanguage"]): boolean {
  if (!replyLanguage || replyLanguage === "unknown" || replyLanguage === "mixed") return false;
  const text = `${action.label} ${action.message ?? ""}`;
  const hasSinhala = [...text].some((char) => {
    const code = char.charCodeAt(0);
    return code >= 0x0d80 && code <= 0x0dff;
  });
  const hasTamil = [...text].some((char) => {
    const code = char.charCodeAt(0);
    return code >= 0x0b80 && code <= 0x0bff;
  });
  if (replyLanguage === "english") return hasSinhala || hasTamil;
  if (replyLanguage === "sinhala") return hasTamil;
  if (replyLanguage === "tamil") return hasSinhala;
  return false;
}

export function validateSuggestedActions(input: {
  actions: WidgetAction[];
  state: AgentTurnState;
  currentProductSkus?: string[];
}): { actions: WidgetAction[]; flags: string[] } {
  const flags: string[] = [];
  const seen = new Set<string>();
  const recentLabels = new Set(input.state.memory.recentSuggestedActionLabels.map(normalized));
  const recentMessages = new Set(input.state.memory.recentSuggestedActionMessages.map(normalized));
  const currentProducts = new Set((input.currentProductSkus ?? []).map((sku) => sku.toUpperCase()));
  const recentProducts = new Set(input.state.memory.recentProductSkus.map((sku) => sku.toUpperCase()));

  const actions = input.actions.filter((action) => {
    const key = actionKey(action);
    if (!key || seen.has(key)) {
      flags.push("removed_duplicate_action");
      return false;
    }
    seen.add(key);

    if (looksLikeLanguageMismatch(action, input.state.replyLanguage)) {
      flags.push("removed_language_mismatch_action");
      return false;
    }

    if (action.type === "message") {
      const labelKey = normalized(action.label);
      const messageKey = normalized(action.message);
      if (labelKey && recentLabels.has(labelKey) && messageKey && recentMessages.has(messageKey)) {
        flags.push("removed_recent_repeated_action");
        return false;
      }
    }

    if (action.sku) {
      const sku = action.sku.toUpperCase();
      if (currentProducts.size && !currentProducts.has(sku)) {
        flags.push("removed_stale_product_action");
        return false;
      }
      if (input.state.userMove === "show_more" && recentProducts.has(sku)) {
        flags.push("removed_recent_product_action");
        return false;
      }
    }

    return true;
  });

  return { actions: actions.slice(0, 4), flags };
}
