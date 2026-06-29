import { ApiError, ErrorCodes, type AuthContext, type ChatIntent, type ChatResult, type ChatSubIntent, type FunnelStage, type QualificationState, type TenantConfig, type WidgetAction } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { listCatalogSearchHints, type CatalogSearchHints } from "../catalog/products";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { retrieveKnowledge } from "../ingest/retrieve";
import type { ScoredChunk } from "../ingest/types";
import { createLLMProvider } from "../llm/provider";
import type { ChatMessage } from "../llm/types";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { loadCart } from "./cart";
import {
  historyToChatMessages,
  loadMessageHistory,
  markConversationContactRequestSent,
  persistMessage,
  resolveConversation,
  setConversationHumanHandling,
  type StoredMessage,
  updateConversationFunnel,
} from "./conversation";
import { ragSourceTypesForIntent } from "./intent";
import { resolveFunnelContext } from "./funnel";
import { mergeQualification } from "./qualification";
import { boostObjectionFaqChunks } from "./rag-boost";
import { tenantHasPageVoiceVectors } from "../page-voice/service";
import { buildSystemPrompt } from "./prompts";
import {
  buildNoProductResultsReply,
  compactReplyText,
  enrichReplyWithProductSearch,
  extractProductHitsFromTools,
  formatProductListForReply,
  productSearchWasEmpty,
  sanitizeReplyText,
} from "./product-reply";
import { appendCtaPromptLine, applyEngagementQuestion, buildBudgetSuggestedActions, buildSuggestedCtas } from "./cta";
import { buildProductResultsIntro } from "./conversation-policy";
import { buildProductSearchQuery } from "./product-query";
import {
  plannerFallbackQuestion,
  plannerProductResultsIntro,
  plannerSearchQuery,
  plannerSuggestedActions,
  publicSalesPlan,
  runSalesPlanner,
  salesPlanToQualificationPatch,
  trustedSalesPlan,
  type ChatAttributeRequest,
  type ChatCloseIntent,
  type ChatPlanAction,
  type SalesPlan,
} from "./sales-planner";
import {
  handleStaleCartMessage,
  isCartAbandonmentReply,
  isCartContinuationReply,
  shouldPauseForStaleCart,
} from "./stale-cart";
import { executeTool, toolsForIntent } from "./tools";
import { ChatTurnTrace, persistChatTraceSafely } from "./trace";
import { assertChannelEnabled, incrementUsage, reserveMessageQuota } from "./usage";
import { assertTenantOperational } from "../tenant/status";
import { notifyAgentInboundMessage, getHandlingMode } from "./agent-notify";
import { marketFromTimezone } from "./locale";
import { buildAgentMemory, buildAgentTurnState } from "./agent-state";
import { applyAgentPolicy, filterToolsByAgentPolicy, validateSuggestedActions } from "./agent-policy";
import { validateResponseQuality } from "./response-quality";
import { aiWalletAllowsAi, debitAiWalletForUsage } from "../billing/ai-wallet";

const MAX_TOOL_ROUNDS = 3;

function webManualContactRequestMessage(handoffMessage?: string) {
  const intro = handoffMessage?.trim() || "Thanks — our team has been notified.";
  return `${intro} Please share your phone number or email here, and our team will contact you shortly.`;
}

interface ResponseModelRoute {
  model: string;
  baseModel: string;
  escalationModel: string;
  escalated: boolean;
  reasons: string[];
}

function modelForIntent(tenantConfig: TenantConfig, intent: ChatIntent, fallbackModel: string) {
  return (
    tenantConfig.llmConfig.models[intent === "faq" ? "faq" : intent === "checkout" ? "checkout" : "product"] ??
    fallbackModel
  );
}

function escalationModel(tenantConfig: TenantConfig, config: CoreConfig, baseModel: string) {
  return (
    tenantConfig.llmConfig.escalationModel ??
    config.escalationModel ??
    tenantConfig.llmConfig.models.checkout ??
    baseModel
  );
}

function messageHasRiskTerms(message: string) {
  return /\b(?:payment|pay|paid|refund|return|exchange|warranty|guarantee|delivery|shipping|ship|address|cancel|order|checkout|invoice|price|discount|coupon|damaged|broken)\b/i.test(
    message
  );
}

function selectResponseModel(input: {
  intent: ChatIntent;
  subIntent: ChatSubIntent;
  plan?: SalesPlan;
  cartItemCount: number;
  gateProductSearch: boolean;
  productSearchEmpty: boolean;
  message: string;
  tenantConfig: TenantConfig;
  config: CoreConfig;
}): ResponseModelRoute {
  const baseModel = modelForIntent(input.tenantConfig, input.intent, input.config.llmModel);
  const highModel = escalationModel(input.tenantConfig, input.config, baseModel);
  const reasons: string[] = [];

  const confidence = typeof input.plan?.confidence === "number" ? input.plan.confidence : undefined;
  if (confidence !== undefined && confidence < 0.55) reasons.push("low_planner_confidence");
  if (input.intent === "unknown") reasons.push("unknown_intent");
  if (input.intent === "checkout" || input.subIntent === "checkout_ready" || input.subIntent === "cart_review") {
    reasons.push("checkout_or_cart");
  }
  if (messageHasRiskTerms(input.message)) {
    if (
      input.cartItemCount > 0 ||
      input.intent === "faq" ||
      input.intent === "checkout" ||
      input.subIntent === "faq_policy" ||
      input.subIntent === "checkout_ready" ||
      input.subIntent === "cart_review"
    ) {
      reasons.push(input.cartItemCount > 0 ? "cart_with_risk_terms" : "policy_risk_terms");
    }
  }
  if (input.plan?.responsePolicy === "recover" || input.plan?.resultPolicy === "relax_constraints") {
    reasons.push("planner_recovery");
  }
  if (input.productSearchEmpty && !input.gateProductSearch) reasons.push("empty_product_search");

  const escalated = reasons.length > 0 && highModel !== baseModel;
  return {
    model: escalated ? highModel : baseModel,
    baseModel,
    escalationModel: highModel,
    escalated,
    reasons: reasons.length ? reasons : ["default_intent_model"],
  };
}

function shouldRetryResponseQuality(flags: string[]) {
  return flags.some((flag) =>
    [
      "language_mismatch",
      "used_quality_fallback",
      "repaired_unfinished_sentence",
      "repaired_artifacts",
    ].includes(flag)
  );
}

export interface OrchestratorInput {
  channel: string;
  externalUserId: string;
  message: string;
  metadata?: { pageUrl?: string; [key: string]: unknown };
}

export interface OrchestratorOptions {
  onToken?: (token: string) => void | Promise<void>;
}

async function loadTenantContext(auth: AuthContext, config: CoreConfig) {
  await assertTenantOperational(auth.tenantId, config);
  const db = getDocClient(config);
  const configRes = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.config() },
    })
  );
  if (!configRes.Item) throw new ApiError(ErrorCodes.NOT_FOUND, "Config not found", 404);

  const profileRes = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.profile() },
    })
  );
  if (!profileRes.Item) throw new ApiError(ErrorCodes.NOT_FOUND, "Tenant not found", 404);

  const { PK: _pk, SK: _sk, ...tenantConfig } = configRes.Item;
  return {
    storeName: profileRes.Item.storeName as string,
    timezone: profileRes.Item.timezone as string | undefined,
    config: tenantConfig as TenantConfig,
  };
}

async function retrieveForIntent(
  auth: AuthContext,
  query: string,
  intent: ChatIntent,
  config: CoreConfig,
  _message?: string,
  options?: { subIntent?: ChatSubIntent; objectionsRaised?: string[] }
): Promise<ScoredChunk[]> {
  let sourceTypes = ragSourceTypesForIntent(intent, undefined, options?.subIntent);
  const conversationEnabled = await tenantHasPageVoiceVectors(auth.tenantId, config);
  if (!conversationEnabled) {
    sourceTypes = sourceTypes.filter((t) => t !== "conversation");
  }

  const batches = await Promise.all(
    sourceTypes.map((sourceType) =>
      retrieveKnowledge(auth, query, config, { topK: 4, sourceType })
    )
  );
  const byKey = new Map<string, ScoredChunk>();
  for (const hit of batches.flat()) {
    const key =
      hit.chunk.metadata.sku ??
      `${hit.chunk.metadata.source_type}:${hit.chunk.sourceId}:${hit.chunk.id}`;
    const existing = byKey.get(key);
    if (!existing || hit.score > existing.score) byKey.set(key, hit);
  }
  const all = [...byKey.values()].filter((hit) => hit.score > 0.03);
  if (all.length === 0) {
    return retrieveKnowledge(auth, query, config, { topK: 5 });
  }
  let ranked = all
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (options?.subIntent === "faq_objection" || options?.objectionsRaised?.length) {
    ranked = boostObjectionFaqChunks(ranked, options?.objectionsRaised ?? []);
  }

  return ranked;
}

function generateFallbackReply(
  intent: ChatIntent,
  greeting: string,
  userMessage: string,
  ragChunks: ScoredChunk[],
  toolResults: Array<{ tool: string; success: boolean; result: unknown }>,
  currency: string,
  channel?: string
): string {
  if (intent === "greeting") return greeting;

  const searchResult = toolResults.find((t) => t.tool === "search_products" && t.success);
  if (searchResult) {
    const data = searchResult.result as {
      products?: Array<{ name: string; price: number; sku: string; currency?: string; inStock?: boolean }>;
    };
    if (data.products?.length) {
      return formatProductListForReply(data.products, currency, { channel });
    }
  }

  if (ragChunks.length > 0 && ragChunks[0]!.score > 0.1) {
    const snippet = ragChunks
      .slice(0, 2)
      .map((h) => h.chunk.text.slice(0, 600))
      .join("\n\n");
    return `Based on our knowledge base:\n\n${snippet}`;
  }

  return `Thanks for your message. I'm still learning about this store — could you tell me more about what you're looking for? You asked: "${userMessage.slice(0, 120)}"`;
}

function shouldRunProductSearch(
  intent: ChatIntent,
  gateProductSearch: boolean
): boolean {
  if (gateProductSearch || intent === "greeting") return false;
  return intent === "product" || intent === "checkout";
}

function plannedIntent(planIntent: unknown, fallback: ChatIntent): ChatIntent {
  return planIntent === "faq" ||
    planIntent === "product" ||
    planIntent === "checkout" ||
    planIntent === "greeting" ||
    planIntent === "unknown"
    ? planIntent
    : fallback;
}

function plannedSubIntent(planSubIntent: unknown, fallback: ChatSubIntent): ChatSubIntent {
  return planSubIntent === "product_browse" ||
    planSubIntent === "product_compare" ||
    planSubIntent === "product_detail" ||
    planSubIntent === "faq_policy" ||
    planSubIntent === "faq_objection" ||
    planSubIntent === "cart_review" ||
    planSubIntent === "checkout_ready" ||
    planSubIntent === "order_status"
    ? planSubIntent
    : fallback;
}

function plannedFunnelStage(stage: unknown, fallback: FunnelStage): FunnelStage {
  return stage === "discover" || stage === "compare" || stage === "objection" || stage === "cart" || stage === "checkout"
    ? stage
    : fallback;
}

function actionRunsProductSearch(action?: ChatPlanAction): boolean {
  return action === "search_products";
}

function appendPlannerQuestion(reply: string, question?: string): string {
  const trimmedQuestion = question?.trim();
  if (!trimmedQuestion) return reply;
  const normalizedReply = reply.toLowerCase();
  const normalizedQuestion = trimmedQuestion.toLowerCase();
  if (normalizedReply.includes(normalizedQuestion)) return reply;
  return `${reply} ${trimmedQuestion}`;
}

function sizeSnippetFromProduct(product: { name?: string; description?: string }): string | undefined {
  const text = `${product.name ?? ""} ${product.description ?? ""}`.replace(/<[^>]*>/g, " ");
  const matches = [
    ...text.matchAll(
      /\b\d+(?:\.\d+)?\s*(?:"|inches?|inch|in\b|cm\b|centimeters?|centimetres?|mm\b)\b/gi
    ),
  ].map((match) => match[0].replace(/\s+/g, " ").trim());
  return [...new Set(matches)].slice(0, 2).join(", ") || undefined;
}

function buildProductAttributeReply(
  products: Array<{ name?: string; description?: string }>,
  attributeRequest?: ChatAttributeRequest
): string | undefined {
  const attribute = attributeRequest && attributeRequest !== "none" ? attributeRequest : undefined;
  if (!attribute) return undefined;
  const heightRows = products
    .map((product) => {
      const size = sizeSnippetFromProduct(product);
      const name = product.name?.replace(/\s+/g, " ").trim();
      return size && name ? `${name}: ${size}` : undefined;
    })
    .filter((row): row is string => Boolean(row))
    .slice(0, 3);
  if (!heightRows.length) return undefined;
  if (["height", "size", "dimensions"].includes(attribute)) {
    return `The available sizes I can see are: ${heightRows.join("; ")}.`;
  }
  return `Here are the details I can see: ${heightRows.join("; ")}.`;
}

const PRODUCT_SURFACE_TOOLS = new Set(["search_products", "compare_products", "get_related_products"]);

function stripProductToolResults(
  toolResults: Array<{ tool: string; success: boolean; result: unknown }>
) {
  return toolResults.filter((t) => !PRODUCT_SURFACE_TOOLS.has(t.tool));
}

function summarizeRetrievedChunks(ragChunks: ScoredChunk[]): ChatResult["retrievedChunks"] {
  return ragChunks.map((hit) => ({
    sourceType: hit.chunk.metadata.source_type,
    sourceId: hit.chunk.sourceId,
    chunkId: hit.chunk.id,
    title: hit.chunk.metadata.title,
    section: hit.chunk.metadata.section,
    sku: hit.chunk.metadata.sku,
    score: Number(hit.score.toFixed(4)),
    textPreview: hit.chunk.text.replace(/\s+/g, " ").trim().slice(0, 240),
  }));
}

function summarizeToolObservations(toolResults: Array<{ tool: string; success: boolean; result: unknown }>): Array<Record<string, unknown>> {
  return toolResults
    .map((item) => {
      const result = item.result as { observation?: unknown };
      return result?.observation && typeof result.observation === "object"
        ? { tool: item.tool, success: item.success, ...(result.observation as Record<string, unknown>) }
        : undefined;
    })
    .filter((item): item is { tool: string; success: boolean } & Record<string, unknown> => Boolean(item));
}

function productSearchDiagnostic(toolResults: Array<{ tool: string; success: boolean; result: unknown }>): {
  relaxedPriceCoverage?: { min?: number; max?: number };
  blockedBy?: "budget" | "stock" | "constraints";
} {
  for (const item of toolResults) {
    if (item.tool !== "search_products" || !item.success) continue;
    const observation = (item.result as { observation?: unknown }).observation as
      | { relaxedPriceCoverage?: { min?: number; max?: number }; blockedBy?: "budget" | "stock" | "constraints" }
      | undefined;
    if (observation?.relaxedPriceCoverage || observation?.blockedBy) {
      return {
        relaxedPriceCoverage: observation.relaxedPriceCoverage,
        blockedBy: observation.blockedBy,
      };
    }
  }
  return {};
}

function messageContainsTerm(message: string, term: string): boolean {
  const cleaned = term.trim();
  if (cleaned.length < 3) return false;
  return new RegExp(`(^|\\W)${cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`, "i").test(message);
}

function latestCatalogRefinementTerms(message: string, catalogHints?: CatalogSearchHints): string[] {
  const terms = new Map<string, string>();
  const add = (term: string) => {
    const cleaned = term.trim();
    if (cleaned.length >= 3) terms.set(cleaned.toLowerCase(), cleaned);
  };
  for (const [alias, values] of Object.entries(catalogHints?.aliases ?? {})) {
    if (!messageContainsTerm(message, alias)) continue;
    for (const value of values) add(value);
  }
  for (const term of [
    ...(catalogHints?.offeringTypes ?? []),
    ...(catalogHints?.audiences ?? []),
    ...(catalogHints?.decisionFactors ?? []),
    ...(catalogHints?.materials ?? []),
    ...(catalogHints?.categories ?? []),
    ...(catalogHints?.tags ?? []),
    ...(catalogHints?.useCases ?? []),
    ...(catalogHints?.styles ?? []),
    ...(catalogHints?.occasions ?? []),
  ]) {
    if (messageContainsTerm(message, term)) add(term);
  }
  return [...terms.values()].slice(0, 4);
}

function shouldApplyLatestCatalogRefinement(plan: ReturnType<typeof trustedSalesPlan>): boolean {
  return (
    plan?.userMove === "show_more" ||
    plan?.contextPolicy === "show_more" ||
    plan?.resultPolicy === "exclude_seen"
  );
}

function productSearchLimit(plan: ReturnType<typeof trustedSalesPlan>): number {
  return shouldApplyLatestCatalogRefinement(plan) ? 6 : 3;
}

function mergeSearchQueryTerms(query: string | undefined, terms: string[]): string | undefined {
  const parts = [...(query ? [query] : []), ...terms].map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return query;
  const seen = new Map<string, string>();
  for (const part of parts) seen.set(part.toLowerCase(), part);
  return [...seen.values()].join(" ");
}

function mergeWidgetActions(primary: WidgetAction[], fallback: WidgetAction[], limit = 3): WidgetAction[] {
  const seen = new Set<string>();
  const merged: WidgetAction[] = [];
  for (const action of [...primary, ...fallback]) {
    const key = [action.type, action.label, action.message, action.sku, action.action]
      .filter(Boolean)
      .join("|")
      .toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(action);
    if (merged.length >= limit) break;
  }
  return merged;
}

function asksBudgetQuestion(reply: string, plan: ReturnType<typeof trustedSalesPlan>): boolean {
  if (plan?.missingSlot === "budget") return true;
  const normalized = reply.toLowerCase();
  return normalized.includes("?") && /\b(budget|price range|spend|stay within)\b/.test(normalized);
}

function asksRecipientQuestion(reply: string): boolean {
  const normalized = reply.toLowerCase();
  return normalized.includes("?") && /\b(who|whom)\b/.test(normalized) && /\b(for|buy|gift|recipient)\b/.test(normalized);
}

function asksAgeGroupQuestion(reply: string): boolean {
  const normalized = reply.toLowerCase();
  return normalized.includes("?") && /\b(age group|age range|ages|how old)\b/.test(normalized);
}

function messageAction(label: string, message: string): WidgetAction {
  return { type: "message", label, message };
}

function uniqueLabels(values: Array<string | undefined>, max = 3): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const label = value?.trim();
    const key = label?.toLowerCase();
    if (!label || !key || seen.has(key)) continue;
    seen.add(key);
    output.push(label);
    if (output.length >= max) break;
  }
  return output;
}

function missingSlotAnswerActions(input: {
  reply: string;
  plan: ReturnType<typeof trustedSalesPlan>;
  catalogHints?: CatalogSearchHints;
  products?: ReturnType<typeof extractProductHitsFromTools>;
  qualification?: QualificationState;
  market?: "default" | "lk";
}): WidgetAction[] {
  const { reply, plan, catalogHints, products = [], qualification, market = "default" } = input;
  if (asksBudgetQuestion(reply, plan)) {
    const budgetActions = buildBudgetSuggestedActions(catalogHints, products, qualification);
    if (budgetActions.length) return budgetActions;
    return market === "lk"
      ? [
          messageAction("Under LKR 5,000", "Show options under LKR 5,000"),
          messageAction("LKR 5,000-10,000", "Show options from LKR 5,000 to LKR 10,000"),
          messageAction("Above LKR 10,000", "Show options above LKR 10,000"),
        ]
      : [
          messageAction("Under $50", "Show options under $50"),
          messageAction("$50-$100", "Show options from $50 to $100"),
          messageAction("Above $100", "Show options above $100"),
        ];
  }

  if (asksAgeGroupQuestion(reply)) {
    return [
      messageAction("Toddlers", "Show gifts for toddlers"),
      messageAction("Kids", "Show gifts for kids"),
      messageAction("Teens", "Show gifts for teens"),
    ];
  }

  switch (plan?.missingSlot) {
    case "recipient": {
      const recipients = uniqueLabels([...(catalogHints?.audiences ?? []), ...(catalogHints?.recipients ?? [])]);
      const fallback = ["kids", "adults", "someone special"];
      return (recipients.length ? recipients : fallback).map((recipient) =>
        messageAction(`For ${recipient}`, `It's for ${recipient}`)
      );
    }
    case "use_case": {
      const useCases = uniqueLabels([...(catalogHints?.useCases ?? []), ...Object.keys(catalogHints?.useCaseProfiles ?? {})]);
      const fallback = ["Birthday gift", "Home decor", "Personal use"];
      return (useCases.length ? useCases : fallback).map((useCase) => messageAction(useCase, `It's for ${useCase}`));
    }
    case "style": {
      const styles = uniqueLabels([
        ...(catalogHints?.styles ?? []),
        ...(catalogHints?.decisionFactors ?? []).filter((factor) => factor.toLowerCase() !== "budget"),
      ]);
      const fallback = ["Classic", "Modern", "Premium"];
      return (styles.length ? styles : fallback).map((style) => messageAction(style, `Narrow by ${style}`));
    }
    case "quantity":
      return [
        messageAction("1 item", "I need 1 item"),
        messageAction("2 items", "I need 2 items"),
        messageAction("Bulk order", "I need a bulk order"),
      ];
    default:
      if (asksRecipientQuestion(reply)) {
        return ["kids", "adults", "someone special"].map((recipient) =>
          messageAction(`For ${recipient}`, `It's for ${recipient}`)
        );
      }
      return [];
  }
}

function purchaseConfirmationReply(productCount: number): string {
  return productCount > 1
    ? "Yes, these options are in stock. Choose the option you like and I can help you add it to cart."
    : "Yes, this option is in stock. You can add it to cart from the product card below.";
}

function normalizedTokens(value?: string): string[] {
  const tokens: string[] = [];
  let current = "";
  for (const char of (value ?? "").toLowerCase()) {
    const code = char.charCodeAt(0);
    const isWordChar = (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
    if (isWordChar) {
      current += char;
    } else if (current) {
      tokens.push(current);
      current = "";
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function editDistanceWithin(left: string, right: string, maxDistance: number): boolean {
  if (Math.abs(left.length - right.length) > maxDistance) return false;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let best = current[0]!;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      current[j] = value;
      best = Math.min(best, value);
    }
    if (best > maxDistance) return false;
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]! <= maxDistance;
}

function tokenMatches(messageToken: string, productToken: string): boolean {
  if (messageToken === productToken) return true;
  if (messageToken.length < 5 || productToken.length < 5) return false;
  return editDistanceWithin(messageToken, productToken, productToken.length >= 9 ? 2 : 1);
}

function asksForSimilarOptions(message: string): boolean {
  return /\b(more\s+like|similar|like\s+this|looks?\s+like|alternatives?|anything\s+else|what\s+else)\b/i.test(message);
}

function asksSuitabilityFollowUp(message: string): boolean {
  return /\b(which|what|what\s+one|which\s+one|which\s+is|what\s+is)\b[\s\S]{0,60}\b(suitable|best|better|good|recommend|recommended|ideal)\b/i.test(message) ||
    /\b(suitable|best|better|good|ideal)\b[\s\S]{0,60}\b(for|as)\b/i.test(message);
}

function contextTermsFromQualification(qualification?: QualificationState): string[] {
  return [
    qualification?.category,
    ...(qualification?.constraints ?? []),
  ]
    .map((term) => term?.trim())
    .filter((term): term is string => Boolean(term));
}

function messageContainsCatalogPhrase(message: string, phrase: string): boolean {
  const messageWords = normalizedTokens(message);
  const phraseWords = normalizedTokens(phrase);
  if (!messageWords.length || !phraseWords.length || phraseWords.length > messageWords.length) return false;
  for (let index = 0; index <= messageWords.length - phraseWords.length; index += 1) {
    if (phraseWords.every((word, offset) => messageWords[index + offset] === word)) return true;
  }
  return false;
}

function deterministicConcreteSearchPlan(message: string, catalogHints?: CatalogSearchHints): SalesPlan | null {
  if (asksForSimilarOptions(message) || asksSuitabilityFollowUp(message)) return null;
  const tokens = new Set(normalizedTokens(message));
  const broadWords = new Set(["best", "recommend", "suggest", "suitable", "gift", "gifts", "birthday", "anniversary", "budget", "premium", "cheap"]);
  const attributeWords = new Set(["height", "heights", "size", "sizes", "dimension", "dimensions", "color", "colors", "price", "stock"]);
  if ([...tokens].some((token) => broadWords.has(token) || attributeWords.has(token))) return null;
  const candidates = [
    ...(catalogHints?.productTypeHints ?? []).map((hint) => hint.term),
    ...(catalogHints?.categories ?? []),
    ...(catalogHints?.offeringTypes ?? []),
  ]
    .map((term) => term.trim())
    .filter((term) => term.length >= 4)
    .sort((a, b) => b.length - a.length);
  const matched = candidates.find((term) => messageContainsCatalogPhrase(message, term));
  if (!matched) return null;
  return {
    confidence: 0.9,
    userMove: "new_request",
    intent: "product",
    subIntent: "product_browse",
    funnelStage: "compare",
    action: "search_products",
    gateProductSearch: false,
    contextPolicy: "reset",
    resultPolicy: "exact",
    responsePolicy: "show_cards",
    searchQuery: matched,
    productType: matched,
    missingSlot: "none",
    resetContext: true,
    closeIntent: "none",
    toolPolicy: { allowedTools: ["search_products", "get_product_details", "get_related_products"] },
    reasonCodes: ["deterministic_concrete_product_fast_path"],
  };
}

function deterministicCatalogChipPlan(
  message: string,
  existingQualification: QualificationState | undefined,
  catalogHints?: CatalogSearchHints
): SalesPlan | null {
  const normalized = message.replace(/^show\s+me\s+/i, "").trim();
  if (!normalized || normalized.length > 60 || !existingQualification) return null;
  const candidates = [
    ...(catalogHints?.offeringTypes ?? []),
    ...(catalogHints?.occasions ?? []),
    ...(catalogHints?.useCases ?? []),
    ...(catalogHints?.audiences ?? []),
    ...(catalogHints?.decisionFactors ?? []),
    ...(catalogHints?.categories ?? []),
    ...(catalogHints?.tags ?? []),
  ];
  const matched = candidates.find((term) => term.toLowerCase() === normalized.toLowerCase());
  if (!matched) return null;
  const contextTerms = contextTermsFromQualification(existingQualification);
  return {
    confidence: 0.9,
    userMove: "chip_selection",
    intent: "product",
    subIntent: "product_browse",
    funnelStage: "compare",
    action: "search_products",
    gateProductSearch: false,
    contextPolicy: "continue",
    resultPolicy: "exact",
    responsePolicy: "show_cards",
    searchQuery: mergeSearchQueryTerms(matched, contextTerms),
    productType: matched,
    missingSlot: "none",
    resetContext: false,
    closeIntent: "none",
    toolPolicy: { allowedTools: ["search_products", "get_product_details", "get_related_products"] },
    reasonCodes: ["deterministic_catalog_chip_search"],
  };
}

function recentProductInterestOverride(
  message: string,
  history: StoredMessage[]
): { closeIntent: ChatCloseIntent; closeTarget: { sku?: string; name?: string; confidence?: number } } | undefined {
  if (asksForSimilarOptions(message)) return undefined;
  const messageTokens = normalizedTokens(message);
  const interestWords = new Set(["want", "need", "get", "buy", "take", "order", "like", "interested"]);
  if (!messageTokens.some((token) => interestWords.has(token))) return undefined;
  const weakProductWords = new Set(["brass", "wooden", "wood", "base", "display", "box", "with", "and", "the", "this", "that", "gift"]);
  const meaningfulMessageTokens = messageTokens.filter((token) => token.length >= 3 && !interestWords.has(token) && !weakProductWords.has(token));
  if (!meaningfulMessageTokens.length) return undefined;

  let best: { sku?: string; name?: string; score: number } | undefined;
  for (const product of buildAgentMemory(history).recentProducts) {
    const productTokens = normalizedTokens(product.name).filter((token) => token.length >= 3 && !weakProductWords.has(token));
    if (!productTokens.length) continue;
    const matches = productTokens.filter((productToken) =>
      meaningfulMessageTokens.some((messageToken) => tokenMatches(messageToken, productToken))
    );
    const hasStrongNameMatch = matches.some((token) => token.length >= 5);
    const score = matches.length / Math.max(1, Math.min(productTokens.length, meaningfulMessageTokens.length));
    if (!hasStrongNameMatch && matches.length < 2) continue;
    if (!best || score > best.score) best = { sku: product.sku, name: product.name, score };
  }
  if (!best || best.score < 0.3) return undefined;
  return {
    closeIntent: "product_interest",
    closeTarget: { sku: best.sku, name: best.name, confidence: Math.min(0.95, Math.max(0.7, best.score)) },
  };
}

export async function runChatOrchestrator(
  auth: AuthContext,
  input: OrchestratorInput,
  config: CoreConfig,
  options?: OrchestratorOptions
): Promise<ChatResult> {
  const text = input.message?.trim();
  if (!text) throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Message is required", 400);
  const trace = new ChatTurnTrace({
    tenantId: auth.tenantId,
    channel: input.channel,
    externalUserId: input.externalUserId,
    messagePreview: text.slice(0, 120),
  });
  trace.mark("token_callback_enabled", Boolean(options?.onToken));

  await trace.time("channel_quota", async () => {
    await assertChannelEnabled(auth.tenantId, input.channel, config);
    if (input.channel !== "test") {
      await reserveMessageQuota(auth.tenantId, config);
    }
  });

  const { storeName, timezone, config: tenantConfig } = await trace.time("load_tenant_context", () => loadTenantContext(auth, config));
  let conversation = await trace.time("resolve_conversation", () =>
    resolveConversation(
      auth.tenantId,
      input.channel,
      input.externalUserId,
      config
    )
  );

  const handlingModeBeforeManualOverride = getHandlingMode(conversation);
  let prepaidWalletStatus: string | undefined;
  let prepaidWalletBalanceMinor: number | undefined;
  let prepaidWalletBlocked = false;
  if (input.channel !== "test") {
    const walletCheck = await trace.time("ai_wallet_check", () => aiWalletAllowsAi(auth.tenantId, config));
    prepaidWalletStatus = walletCheck.wallet.status;
    prepaidWalletBalanceMinor = walletCheck.wallet.balanceMinor;
    prepaidWalletBlocked = !walletCheck.allowed;
    trace.mark("ai_wallet_status", prepaidWalletStatus);
    trace.mark("ai_wallet_balance_minor", prepaidWalletBalanceMinor);
    trace.mark("ai_wallet_blocked", prepaidWalletBlocked);
  }
  const manualRepliesOnly = tenantConfig.featureFlags?.manualRepliesOnly === true || prepaidWalletBlocked;
  const forcedManualThisTurn = manualRepliesOnly && handlingModeBeforeManualOverride !== "human";
  if (forcedManualThisTurn) {
    conversation = await trace.time("force_manual_handling", () =>
      setConversationHumanHandling(auth.tenantId, conversation, config)
    );
  }

  const handlingMode = getHandlingMode(conversation);
  if (handlingMode === "human") {
    await trace.time("persist_human_inbound", () => persistMessage(auth.tenantId, conversation, "inbound", "user", text, config, {
      awaitingAgent: true,
    }));
    await trace.time("notify_agent", () => notifyAgentInboundMessage(auth.tenantId, conversation, text, config));

    const shouldAskForContact =
      (input.channel === "web" || input.channel === "test") && !conversation.contactRequestAt;
    const webAck =
      shouldAskForContact
        ? webManualContactRequestMessage(tenantConfig.prompts?.handoffMessage)
        : "";
    if (webAck) {
      await trace.time("persist_web_contact_request", () =>
        persistMessage(auth.tenantId, conversation, "outbound", "assistant", webAck, config, {
          handoff: true,
          contactRequest: true,
        })
      );
      conversation = await trace.time("mark_contact_request_sent", () =>
        markConversationContactRequestSent(auth.tenantId, conversation, config)
      );
    }

    const result: ChatResult = {
      conversationId: conversation.conversationId,
      reply: { type: "text", content: webAck },
      handledBy: "human",
      handlingMode: "human",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    result.agentTrace = trace.snapshot();
    await persistChatTraceSafely(trace, {
      conversationId: conversation.conversationId,
      config,
      handledBy: "human",
    });
    return result;
  }

  const [history, initialCart, catalogHints] = await trace.time("load_history_cart_catalog_hints", () =>
    Promise.all([
      loadMessageHistory(auth.tenantId, conversation.conversationId, config),
      loadCart(auth.tenantId, conversation.conversationId, config),
      listCatalogSearchHints(auth.tenantId, config),
    ])
  );
  const isFirstMessage = history.length === 0;
  const fallbackIntent: ChatIntent = isFirstMessage ? "unknown" : "product";
  let cart = initialCart;
  const fallbackFunnel = resolveFunnelContext(conversation, {
    message: text,
    intent: fallbackIntent,
    cartItemCount: cart?.items.length ?? 0,
  });
  const fallbackSubIntent: ChatSubIntent = "product_browse";
  const market = marketFromTimezone(timezone);
  const pageUrl = typeof input.metadata?.pageUrl === "string" ? input.metadata.pageUrl : undefined;
  const llm = createLLMProvider(config);
  const fallbackGateProductSearch = false;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const deterministicPlan =
    deterministicCatalogChipPlan(text, conversation.qualification ?? fallbackFunnel.qualification, catalogHints) ??
    deterministicConcreteSearchPlan(text, catalogHints);
  if (deterministicPlan) {
    trace.record("deterministic_planner_fast_path", 0, true, { searchQuery: deterministicPlan.searchQuery });
  }
  const plannerModel = tenantConfig.llmConfig.plannerModel ?? config.plannerModel ?? tenantConfig.llmConfig.models.product ?? config.llmModel;
  const planner = deterministicPlan
    ? { plan: deterministicPlan, usage: { inputTokens: 0, outputTokens: 0 } }
    : await trace.time("llm_planner", () => runSalesPlanner({
      llm,
      model: plannerModel,
      message: text,
      history,
      qualification: conversation.qualification ?? fallbackFunnel.qualification,
      catalogHints,
      fallback: {
        intent: fallbackIntent,
        subIntent: fallbackSubIntent,
        funnelStage: fallbackFunnel.stage,
        gateProductSearch: fallbackGateProductSearch,
      },
      cartItemCount: cart?.items.length ?? 0,
      pageUrl,
    }), { model: plannerModel });
  totalInputTokens += planner.usage.inputTokens;
  totalOutputTokens += planner.usage.outputTokens;
  let trustedPlan = trustedSalesPlan(planner.plan);
  const productInterestOverride = recentProductInterestOverride(text, history);
  if (trustedPlan && productInterestOverride && (!trustedPlan.closeIntent || trustedPlan.closeIntent === "none")) {
    trustedPlan = {
      ...trustedPlan,
      closeIntent: productInterestOverride.closeIntent,
      closeTarget: productInterestOverride.closeTarget,
      userMove: "cart_reply",
      intent: "product",
      subIntent: "product_detail",
      funnelStage: "compare",
      action: "search_products",
      gateProductSearch: false,
      missingSlot: "none",
      nextQuestion: undefined,
      suggestedActions: [],
      toolPolicy: { allowedTools: ["search_products", "get_product_details"] },
      reasonCodes: [...(trustedPlan.reasonCodes ?? []), "recent_product_interest_override"],
    };
  }
  const intent = trustedPlan ? plannedIntent(trustedPlan.intent, fallbackIntent) : fallbackIntent;
  const subIntent = trustedPlan ? plannedSubIntent(trustedPlan.subIntent, fallbackSubIntent) : fallbackSubIntent;
  const plannedStage = trustedPlan ? plannedFunnelStage(trustedPlan.funnelStage, fallbackFunnel.stage) : fallbackFunnel.stage;
  let gateProductSearch = trustedPlan ? Boolean(trustedPlan.gateProductSearch) : fallbackGateProductSearch;
  let planAction: ChatPlanAction | undefined = trustedPlan?.action;
  const funnel = {
    ...fallbackFunnel,
    stage: plannedStage,
    changed: plannedStage !== fallbackFunnel.previousStage,
  };
  const deterministicPatch = {};
  let plannedSearchQuery = plannerSearchQuery(trustedPlan);
  const catalogRefinementTerms =
    trustedPlan && shouldApplyLatestCatalogRefinement(trustedPlan)
      ? latestCatalogRefinementTerms(text, catalogHints)
      : [];
  if (catalogRefinementTerms.length) {
    plannedSearchQuery = mergeSearchQueryTerms(plannedSearchQuery, catalogRefinementTerms);
  }
  const suitabilityFollowUp = asksSuitabilityFollowUp(text) && Boolean(conversation.qualification?.constraints?.length || conversation.qualification?.category);
  if (suitabilityFollowUp) {
    const contextTerms = contextTermsFromQualification(conversation.qualification);
    plannedSearchQuery = mergeSearchQueryTerms(plannedSearchQuery ?? text, contextTerms);
    planAction = "search_products";
    gateProductSearch = false;
    if (trustedPlan) {
      trustedPlan = {
        ...trustedPlan,
        action: "search_products",
        contextPolicy: "continue",
        resultPolicy: "exact",
        gateProductSearch: false,
        resetContext: false,
        missingSlot: "none",
        nextQuestion: undefined,
        reasonCodes: [...(trustedPlan.reasonCodes ?? []), "suitability_followup_preserve_context"],
      };
    }
  }
  const plannedPatch = salesPlanToQualificationPatch(trustedPlan, {
    latestMessage: text,
    catalogAliases: catalogHints?.aliases,
    catalogHints,
  });
  const shouldResetContext = Boolean(trustedPlan?.resetContext);
  const qualificationBase = shouldResetContext ? undefined : conversation.qualification ?? fallbackFunnel.qualification;
  const qualification = mergeQualification(
    mergeQualification(qualificationBase, deterministicPatch),
    mergeQualification(plannedPatch, suitabilityFollowUp
      ? { constraints: contextTermsFromQualification(conversation.qualification) }
      : catalogRefinementTerms.length
        ? { constraints: catalogRefinementTerms }
        : {})
  );
  const forcedSearchFromSelection = trustedPlan?.userMove === "chip_selection" && trustedPlan.action === "search_products";
  const agentState = buildAgentTurnState({
    latestMessage: text,
    intent,
    subIntent,
    funnelStage: funnel.stage,
    qualification,
    planner: trustedPlan,
    history,
    resetContext: shouldResetContext,
  });
  const policy = applyAgentPolicy({
    state: agentState,
    gateProductSearch,
    planAction,
  });
  gateProductSearch = policy.gateProductSearch;
  planAction = policy.planAction;
  const closeIntent = trustedPlan?.closeIntent ?? "none";
  const closeTarget = closeIntent !== "none" ? trustedPlan?.closeTarget : undefined;
  if (closeTarget?.name || closeTarget?.sku) {
    plannedSearchQuery = closeTarget.name ?? closeTarget.sku;
  }
  const funnelOrQualChanged =
    funnel.changed ||
    JSON.stringify(qualification) !== JSON.stringify(conversation.qualification ?? {}) ||
    conversation.lastIntent !== intent ||
    conversation.lastSubIntent !== subIntent;

  if (funnelOrQualChanged) {
    await trace.time("update_conversation_funnel", () => updateConversationFunnel(
      auth.tenantId,
      conversation,
      funnel.stage,
      config,
      qualification,
      intent,
      subIntent
    ));
    conversation.funnelStage = funnel.stage;
    conversation.qualification = qualification;
    conversation.lastIntent = intent;
    conversation.lastSubIntent = subIntent;
  }

  await trace.time("persist_inbound", () => persistMessage(auth.tenantId, conversation, "inbound", "user", text, config, {
    intent,
    subIntent,
    funnelStage: funnel.stage,
  }));

  const activeCart = cart;
  if (activeCart?.items.length && (shouldPauseForStaleCart(text, conversation, activeCart) || isCartAbandonmentReply(text))) {
    const staleOutcome = await trace.time("stale_cart_check", () => handleStaleCartMessage({
      auth,
      conversation,
      cart: activeCart,
      message: text,
      config,
    }));
    if (staleOutcome.handled && staleOutcome.reply) {
      cart = staleOutcome.cart ?? cart;
      const replyContent = compactReplyText(staleOutcome.reply, { channel: input.channel, maxWords: 35 });
      const staleSuggestedActions =
        cart?.items.length && isCartContinuationReply(text)
          ? [
              {
                type: "checkout" as const,
                label: "Checkout now",
                action: "checkout" as const,
                message: "I'm ready to checkout",
              },
              { type: "message" as const, label: "More options", message: "Show me similar options" },
            ]
          : cart?.items.length && !isCartAbandonmentReply(text)
          ? [
              { type: "message" as const, label: "Still interested", message: "Yes, I'm still interested" },
              { type: "message" as const, label: "Clear cart", message: "No, clear my cart" },
            ]
          : [
              { type: "message" as const, label: "Show options", message: "Show me options" },
            ];
      const actionValidation = validateSuggestedActions({
        actions: staleSuggestedActions,
        state: agentState,
      });
      const suggestedActions = actionValidation.actions;
      await trace.time("persist_stale_cart_outbound", () => persistMessage(auth.tenantId, conversation, "outbound", "assistant", replyContent, config, {
        intent,
        subIntent,
        funnelStage: cart?.items.length ? "cart" : "discover",
        staleCartCheck: true,
        suggestedActionLabels: suggestedActions.map((action) => action.label).filter(Boolean),
        suggestedActionMessages: suggestedActions.map((action) => action.message).filter(Boolean),
      }));
      await trace.time("increment_usage_stale_cart", () => incrementUsage(auth.tenantId, config, { inputTokens: 0, outputTokens: 0 }));
      const result: ChatResult = {
        conversationId: conversation.conversationId,
        reply: { type: "text", content: replyContent },
        toolResults: [],
        intent,
        subIntent,
        funnelStage: cart?.items.length ? "cart" : "discover",
        usage: { inputTokens: 0, outputTokens: 0 },
        handledBy: "bot",
        handlingMode: "bot",
        suggestedActions,
      };
      result.agentTrace = { timings: trace.snapshot(), staleCartCheck: true };
      await persistChatTraceSafely(trace, {
        conversationId: conversation.conversationId,
        config,
        intent,
        subIntent,
        funnelStage: cart?.items.length ? "cart" : "discover",
        handledBy: "bot",
      });
      return result;
    }
  }

  const searchQualification = closeIntent !== "none" ? { ...qualification, budget: undefined } : qualification;
  const searchBudget = searchQualification.budget;
  const productAwareQuery = buildProductSearchQuery({
    message: plannedSearchQuery ?? text,
    qualification: searchQualification,
    pageUrl,
  });
  const directPlannerProductSearch = Boolean(trustedPlan && actionRunsProductSearch(planAction) && !gateProductSearch);
  const ragQuery =
    trustedPlan?.ragQuery?.trim() ||
    (intent === "product" || actionRunsProductSearch(planAction) ? productAwareQuery : text);
  const ragChunks = directPlannerProductSearch
    ? []
    : await trace.time("rag_retrieve", () => retrieveForIntent(auth, ragQuery, intent, config, trustedPlan ? undefined : text, {
        subIntent,
        objectionsRaised: qualification.objectionsRaised,
      }), { query: ragQuery.slice(0, 120), intent });
  const currency = tenantConfig.commerceConnector?.currency ?? (market === "lk" ? "LKR" : "USD");
  const conversationPolicy = { reply: undefined, suggestedActions: [] as WidgetAction[] };
  const policyFlags = [...policy.flags];
  if (productInterestOverride && trustedPlan?.reasonCodes?.includes("recent_product_interest_override")) {
    policyFlags.push("recent_product_interest_override");
  }
  const plannerQuestion =
    (policyFlags.includes("recipient_answer_requires_budget") ? "What budget should I stay within?" : undefined) ||
    trustedPlan?.nextQuestion?.trim() ||
    plannerFallbackQuestion(trustedPlan);
  const systemPrompt = buildSystemPrompt(storeName, tenantConfig, ragChunks, cart, {
    channel: input.channel,
    timezone,
    intent,
    subIntent,
    funnelStage: funnel.stage,
    qualification,
    pageUrl,
  });

  const initialTools = toolsForIntent(intent, text, funnel.stage, subIntent, {
    gateProductSearch,
    ...(trustedPlan ? { allowedTools: trustedPlan.toolPolicy?.allowedTools ?? [] } : {}),
  });
  const toolPolicy = filterToolsByAgentPolicy(initialTools, agentState);
  const tools = toolPolicy.tools;
  policyFlags.push(...toolPolicy.flags);
  const excludeSkus = policy.excludeSkus;
  const toolCtx = {
    auth,
    config,
    conversationId: conversation.conversationId,
    checkoutBaseUrl: tenantConfig.commerceConnector.checkoutBaseUrl,
    channel: input.channel,
    externalUserId: input.externalUserId,
    qualification,
    catalogHints,
    pageUrl,
    excludeSkus,
  };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...historyToChatMessages(history).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: text },
  ];

  const toolResults: Array<{ tool: string; success: boolean; result: unknown }> = [];
  let replyContent = "";
  const planAsksQuestion = planAction === "ask_question";
  const planRunsSearch = trustedPlan ? actionRunsProductSearch(planAction) : shouldRunProductSearch(intent, gateProductSearch);

  if (planAsksQuestion && plannerQuestion) {
    replyContent = plannerQuestion;
  }

  if (directPlannerProductSearch) {
    const { result, success } = await trace.time("tool_search_products_direct", () => executeTool(
      "search_products",
      JSON.stringify({
        query: plannedSearchQuery ?? text,
        limit: productSearchLimit(trustedPlan),
        category: qualification.category,
        maxPrice: searchBudget?.max,
        minPrice: searchBudget?.min,
      }),
      toolCtx
    ), { query: String(plannedSearchQuery ?? text).slice(0, 120) });
    toolResults.push({ tool: "search_products", success, result });
  }

  let answerRoute: ResponseModelRoute | null = null;
  let answerGeneratedByLlm = false;
  if (!replyContent && !directPlannerProductSearch && llm) {
    answerRoute = selectResponseModel({
      intent,
      subIntent,
      plan: trustedPlan ?? undefined,
      cartItemCount: cart?.items.length ?? 0,
      gateProductSearch,
      productSearchEmpty: productSearchWasEmpty(toolResults),
      message: text,
      tenantConfig,
      config,
    });
    const model = answerRoute.model;
    trace.record("response_model_route", 0, true, {
      model,
      baseModel: answerRoute.baseModel,
      escalationModel: answerRoute.escalationModel,
      escalated: answerRoute.escalated,
      reasons: answerRoute.reasons,
      plannerConfidence: trustedPlan?.confidence,
    });
    const temperature = tenantConfig.llmConfig.temperature ?? 0.4;
    const maxOutputTokens = Math.min(tenantConfig.llmConfig.maxOutputTokens ?? 800, gateProductSearch ? 200 : 500);

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const request = {
        model,
        messages,
        tools: tools.length ? tools : undefined,
        temperature,
        maxOutputTokens,
      };
      const response =
        options?.onToken && llm.streamChat
          ? await trace.time("llm_answer_stream", () => llm.streamChat!(request, async (event) => {
              if (event.type === "token") await options.onToken?.(event.text);
            }), { model, round })
          : await trace.time("llm_answer", () => llm.chat(request), { model, round });
      trace.mark(`llm_answer_${round}_latency_ms`, response.latencyMs);
      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;

      if (response.toolCalls?.length) {
        messages.push({
          role: "assistant",
          content: response.content || null,
          tool_calls: response.toolCalls,
        });

        for (const tc of response.toolCalls) {
          const { result, success } = await trace.time(`tool_${tc.name}`, () => executeTool(tc.name, tc.arguments, toolCtx), {
            round,
          });
          toolResults.push({ tool: tc.name, success, result });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            name: tc.name,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      replyContent = response.content;
      answerGeneratedByLlm = true;
      break;
    }

    if (!replyContent && intent === "greeting") {
      replyContent = tenantConfig.prompts.greeting;
    }

  }

  if (!replyContent) {
    if (plannerQuestion && (gateProductSearch || planAsksQuestion)) {
      replyContent = plannerQuestion;
    } else if (planRunsSearch && !toolResults.some((t) => t.tool === "search_products" && t.success)) {
      const { result, success } = await trace.time("tool_search_products_fallback", () => executeTool(
        "search_products",
        JSON.stringify({
          query: plannedSearchQuery ?? text,
          limit: productSearchLimit(trustedPlan),
          category: qualification.category,
          maxPrice: searchBudget?.max,
          minPrice: searchBudget?.min,
        }),
        toolCtx
      ), { query: String(plannedSearchQuery ?? text).slice(0, 120) });
      toolResults.push({ tool: "search_products", success, result });
    }
    if (!replyContent) {
      replyContent = generateFallbackReply(
        intent,
        tenantConfig.prompts.greeting,
        text,
        ragChunks,
        toolResults,
        currency,
        input.channel
      );
    }
  }

  if (
    planRunsSearch &&
    !toolResults.some((t) => t.tool === "search_products" && t.success)
  ) {
    const { result, success } = await trace.time("tool_search_products_safety", () => executeTool(
      "search_products",
      JSON.stringify({
        query: plannedSearchQuery ?? text,
        limit: productSearchLimit(trustedPlan),
        category: qualification.category,
        maxPrice: searchBudget?.max,
        minPrice: searchBudget?.min,
      }),
      toolCtx
    ), { query: String(plannedSearchQuery ?? text).slice(0, 120) });
    toolResults.push({ tool: "search_products", success, result });
  }

  if (
    !gateProductSearch &&
    productSearchWasEmpty(toolResults) &&
    (intent === "product" || subIntent === "product_browse" || subIntent === "product_compare")
  ) {
    const diagnostic = productSearchDiagnostic(toolResults);
    replyContent = buildNoProductResultsReply({
      query: text,
      category: qualification.category,
      constraints: qualification.constraints,
      maxPrice: searchBudget?.max,
      minPrice: searchBudget?.min,
      relaxedPriceCoverage: diagnostic.relaxedPriceCoverage,
      blockedBy: diagnostic.blockedBy,
      currency,
      channel: input.channel,
    });
  }

  const responseShapeStart = Date.now();
  replyContent = compactReplyText(sanitizeReplyText(replyContent, input.channel), {
    channel: input.channel,
    maxWords: gateProductSearch ? 35 : undefined,
  });
  const surfaceProducts = !gateProductSearch && intent !== "greeting" && Boolean(trustedPlan);
  const finalToolResults = surfaceProducts ? toolResults : stripProductToolResults(toolResults);
  const finalProducts = extractProductHitsFromTools(finalToolResults);
  const attributeReply = buildProductAttributeReply(finalProducts, trustedPlan?.attributeRequest);
  if (attributeReply) {
    replyContent = attributeReply;
  } else if (closeIntent !== "none" && finalProducts.length) {
    replyContent = purchaseConfirmationReply(finalProducts.length);
  } else if (input.channel === "web" && finalProducts.length) {
    replyContent = plannerProductResultsIntro({
      plan: trustedPlan,
      productCount: finalProducts.length,
      scope: qualification.constraints?.slice(0, 2).join(", "),
    }) ?? buildProductResultsIntro({
      qualification,
      productCount: finalProducts.length,
      market,
    });
  }
  replyContent = enrichReplyWithProductSearch(replyContent, finalToolResults, currency, {
    channel: input.channel,
    skipListAppend: gateProductSearch || !surfaceProducts,
  });

  const refreshedCart = await trace.time("load_refreshed_cart", () => loadCart(auth.tenantId, conversation.conversationId, config));
  let finalFunnel = {
    ...funnel,
    stage: closeIntent === "product_interest" ? "compare" : trustedPlan ? funnel.stage : resolveFunnelContext(conversation, {
      message: text,
      intent,
      cartItemCount: refreshedCart?.items.length ?? 0,
    }).stage,
  };
  if (toolResults.some((t) => t.tool === "create_checkout_link" && t.success)) {
    finalFunnel = {
      ...finalFunnel,
      stage: "checkout",
      changed: finalFunnel.stage !== "checkout",
    };
  }
  if (finalFunnel.stage !== funnel.stage) {
    await trace.time("update_final_funnel", () => updateConversationFunnel(
      auth.tenantId,
      conversation,
      finalFunnel.stage,
      config,
      qualification,
      intent,
      subIntent
    ));
    conversation.funnelStage = finalFunnel.stage;
    conversation.lastIntent = intent;
    conversation.lastSubIntent = subIntent;
  }

  const emptyProductSearch = productSearchWasEmpty(finalToolResults);
  const closeIntentWithProducts = closeIntent !== "none" && finalProducts.length > 0;
  const plannedActions = forcedSearchFromSelection || emptyProductSearch || closeIntentWithProducts ? [] : plannerSuggestedActions(trustedPlan);
  const shouldSupplementBudgetActions = gateProductSearch && asksBudgetQuestion(replyContent, trustedPlan);
  const fallbackSuggestedActions = buildSuggestedCtas({
    funnelStage: finalFunnel.stage,
    subIntent,
    toolResults: finalToolResults,
    cart: refreshedCart,
    channel: input.channel,
    gateProductSearch,
    market,
    catalogHints,
    pageUrl,
    qualification,
    salesPlan: emptyProductSearch ? null : trustedPlan,
    closeIntent,
    budgetQuestion: asksBudgetQuestion(replyContent, trustedPlan),
  });
  const hasProductDiscoveryActions = Boolean(finalProducts.length && !gateProductSearch && fallbackSuggestedActions.length);
  let suggestedActions =
    hasProductDiscoveryActions
      ? fallbackSuggestedActions
      : plannedActions.length
      ? shouldSupplementBudgetActions
        ? fallbackSuggestedActions
        : !gateProductSearch && fallbackSuggestedActions.length
        ? mergeWidgetActions(plannedActions, fallbackSuggestedActions, 3)
        : plannedActions
      : trustedPlan && !emptyProductSearch && !gateProductSearch && !closeIntentWithProducts
      ? fallbackSuggestedActions
      : gateProductSearch && conversationPolicy.suggestedActions?.length
      ? shouldSupplementBudgetActions
        ? fallbackSuggestedActions
        : conversationPolicy.suggestedActions
      : fallbackSuggestedActions;
  if (planAsksQuestion) {
    const answerActions = missingSlotAnswerActions({
      reply: replyContent,
      plan: trustedPlan,
      catalogHints,
      products: finalProducts,
      qualification,
      market,
    });
    if (answerActions.length) suggestedActions = answerActions;
  }
  const appendedPlannerQuestion =
    trustedPlan && !planAsksQuestion && !forcedSearchFromSelection && finalProducts.length
      ? trustedPlan.nextQuestion?.trim()
      : undefined;
  if (appendedPlannerQuestion) {
    replyContent = appendPlannerQuestion(replyContent, appendedPlannerQuestion);
    if (asksBudgetQuestion(appendedPlannerQuestion, trustedPlan)) {
      suggestedActions = buildBudgetSuggestedActions(catalogHints, finalProducts, qualification);
    } else {
      suggestedActions = plannedActions;
    }
  }
  let engagementBaseReply: string | undefined;
  let engagementActionCount = 0;
  if (!trustedPlan) {
    engagementBaseReply = replyContent;
    const engagement = applyEngagementQuestion(replyContent, {
      intent,
      subIntent,
      funnelStage: finalFunnel.stage,
      qualification,
      products: finalProducts,
      catalogHints,
      suggestedActions,
      history,
    });
    replyContent = engagement.reply;
    if (engagement.suggestedActions?.length) {
      suggestedActions = engagement.suggestedActions;
      engagementActionCount = engagement.suggestedActions.length;
    }
  }
  const finalQuestionActions = missingSlotAnswerActions({
    reply: replyContent,
    plan: trustedPlan,
    catalogHints,
    products: finalProducts,
    qualification,
    market,
  });
  if (finalQuestionActions.length) {
    suggestedActions = finalQuestionActions;
  }
  const actionValidation = validateSuggestedActions({
    actions: suggestedActions,
    state: agentState,
    currentProductSkus: finalProducts.map((product) => product.sku).filter(Boolean),
  });
  suggestedActions = actionValidation.actions;
  if (finalQuestionActions.length && !suggestedActions.length) {
    suggestedActions = finalQuestionActions;
    policyFlags.push("restored_question_answer_actions");
  }
  if (engagementBaseReply && engagementActionCount && !suggestedActions.length) {
    replyContent = engagementBaseReply;
    policyFlags.push("removed_unactionable_engagement_question");
  }
  policyFlags.push(...actionValidation.flags);
  replyContent = appendCtaPromptLine(replyContent, suggestedActions, { gateProductSearch });
  replyContent = compactReplyText(replyContent, { channel: input.channel });
  let responseQuality = validateResponseQuality({
    reply: replyContent,
    state: agentState,
    fallbackReply: finalProducts.length
      ? "I found a few options that are in stock and easy to choose from."
      : "I can help narrow this down. What kind of item should I look for?",
  });
  replyContent = responseQuality.reply;
  if (
    llm &&
    answerRoute &&
    answerGeneratedByLlm &&
    !options?.onToken &&
    answerRoute.escalationModel !== answerRoute.model &&
    shouldRetryResponseQuality(responseQuality.flags)
  ) {
    const retryModel = answerRoute.escalationModel;
    const productContext = finalProducts
      .slice(0, 5)
      .map((product) => `${product.name}${product.price ? ` (${currency} ${product.price})` : ""}`)
      .join("; ");
    const retryMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...historyToChatMessages(history).map((m) => ({ role: m.role, content: m.content })),
      {
        role: "user",
        content: [
          text,
          "",
          "Rewrite the assistant reply for the customer. Keep it concise, accurate, and in the customer's language.",
          `Quality issues to fix: ${responseQuality.flags.join(", ")}`,
          productContext ? `Relevant products: ${productContext}` : "",
          suggestedActions.length
            ? `Available next actions: ${suggestedActions.map((action) => action.label).join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];
    const retry = await trace.time(
      "llm_answer_quality_retry",
      () =>
        llm.chat({
          model: retryModel,
          messages: retryMessages,
          temperature: Math.min(tenantConfig.llmConfig.temperature ?? 0.4, 0.3),
          maxOutputTokens: Math.min(tenantConfig.llmConfig.maxOutputTokens ?? 800, 400),
        }),
      { model: retryModel, previousModel: answerRoute.model, flags: responseQuality.flags }
    );
    totalInputTokens += retry.usage.inputTokens;
    totalOutputTokens += retry.usage.outputTokens;
    const retryReply = compactReplyText(
      appendCtaPromptLine(
        compactReplyText(sanitizeReplyText(retry.content, input.channel), { channel: input.channel }),
        suggestedActions,
        { gateProductSearch }
      ),
      { channel: input.channel }
    );
    const retryQuality = validateResponseQuality({
      reply: retryReply,
      state: agentState,
      fallbackReply: responseQuality.reply,
    });
    if (!shouldRetryResponseQuality(retryQuality.flags)) {
      replyContent = retryQuality.reply;
      responseQuality = {
        reply: retryQuality.reply,
        flags: [...responseQuality.flags, "retried_with_escalation_model", ...retryQuality.flags],
      };
      policyFlags.push("quality_retry_escalated");
      trace.record("response_quality_retry", 0, true, {
        retryModel,
        previousModel: answerRoute.model,
        previousFlags: responseQuality.flags,
      });
    } else {
      responseQuality = {
        reply: responseQuality.reply,
        flags: [...responseQuality.flags, "quality_retry_rejected", ...retryQuality.flags],
      };
      trace.record("response_quality_retry", 0, false, {
        retryModel,
        previousModel: answerRoute.model,
        retryFlags: retryQuality.flags,
      });
    }
  }
  const finalProductSkus = finalProducts.map((product) => product.sku).filter(Boolean);
  const finalProductNames = finalProducts.map((product) => product.name).filter(Boolean);
  const recentProductSet = new Set(agentState.memory.recentProductSkus.map((sku) => sku.toUpperCase()));
  const repeatedSurfacedSkus = finalProductSkus.filter((sku) => recentProductSet.has(sku.toUpperCase()));
  const toolObservations = summarizeToolObservations(finalToolResults);
  trace.record("response_shape", Date.now() - responseShapeStart, true, {
    productCount: finalProducts.length,
    actionCount: suggestedActions.length,
  });
  trace.mark("tool_count", finalToolResults.length);
  trace.mark("product_count", finalProducts.length);
  trace.mark("input_tokens", totalInputTokens);
  trace.mark("output_tokens", totalOutputTokens);
  let aiWalletDebit:
    | Awaited<ReturnType<typeof debitAiWalletForUsage>>
    | null = null;
  if (input.channel !== "test" && (totalInputTokens > 0 || totalOutputTokens > 0)) {
    aiWalletDebit = await trace.time("ai_wallet_debit", () =>
      debitAiWalletForUsage(
        auth.tenantId,
        {
          model: answerRoute?.model ?? plannerModel,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          conversationId: conversation.conversationId,
        },
        config
      )
    );
    if (aiWalletDebit.enabled) {
      trace.mark("ai_wallet_debited_minor", aiWalletDebit.debitedMinor);
      trace.mark("ai_wallet_balance_after_minor", aiWalletDebit.wallet.balanceMinor);
      trace.mark("ai_wallet_status_after", aiWalletDebit.wallet.status);
    }
  }
  const agentTrace = {
    userMove: agentState.userMove,
    replyLanguage: agentState.replyLanguage,
    closeIntent,
    closeTarget,
    resetContext: agentState.resetContext,
    gateProductSearch,
    planAction,
    policyFlags,
    responseQualityFlags: responseQuality.flags,
    responseModel: answerRoute?.model ?? null,
    responseModelEscalated: answerRoute?.escalated ?? false,
    responseModelRouteReasons: answerRoute?.reasons ?? [],
    aiWalletStatus: aiWalletDebit?.wallet.status ?? prepaidWalletStatus,
    aiWalletDebitedMinor: aiWalletDebit?.debitedMinor ?? 0,
    aiWalletBalanceAfterMinor: aiWalletDebit?.wallet.balanceMinor ?? prepaidWalletBalanceMinor,
    aiWalletExhausted: aiWalletDebit?.wallet.status === "empty" || prepaidWalletBlocked,
    toolObservations,
    excludeSkus,
    surfacedProductSkus: finalProductSkus,
    surfacedProductNames: finalProductNames,
    repeatedSurfacedSkus,
    repeatedSurfacedSkuCount: repeatedSurfacedSkus.length,
    suggestedActionLabels: suggestedActions.map((action) => action.label).filter(Boolean),
    suggestedActionMessages: suggestedActions.map((action) => action.message).filter(Boolean),
    timings: trace.snapshot(),
  };

  await trace.time("persist_outbound", () => persistMessage(auth.tenantId, conversation, "outbound", "assistant", replyContent, config, {
    intent,
    subIntent,
    funnelStage: finalFunnel.stage,
    llmProvider: llm?.name ?? "fallback",
    llmModel: answerRoute?.model,
    llmModelRouteReasons: answerRoute?.reasons,
    aiWalletDebitedMinor: aiWalletDebit?.debitedMinor ?? 0,
    aiWalletBalanceAfterMinor: aiWalletDebit?.wallet.balanceMinor ?? prepaidWalletBalanceMinor,
    aiWalletStatus: aiWalletDebit?.wallet.status ?? prepaidWalletStatus,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    toolCalls: finalToolResults.map((t) => t.tool),
    surfacedProductSkus: finalProductSkus,
    surfacedProductNames: finalProductNames,
    suggestedActionLabels: agentTrace.suggestedActionLabels,
    suggestedActionMessages: agentTrace.suggestedActionMessages,
    agentTrace,
  }));

  await trace.time("increment_usage", () => incrementUsage(auth.tenantId, config, {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  }));

  const result: ChatResult = {
    conversationId: conversation.conversationId,
    reply: { type: "text", content: replyContent },
    toolResults: finalToolResults.map((t) => ({
      tool: t.tool,
      success: t.success,
      ...(typeof t.result === "object" && t.result ? (t.result as Record<string, unknown>) : {}),
    })),
    intent,
    subIntent,
    funnelStage: finalFunnel.stage,
    retrievedChunks: summarizeRetrievedChunks(ragChunks),
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    handledBy: "bot",
    handlingMode: "bot",
    suggestedActions,
    salesPlan: publicSalesPlan(planner.plan),
    agentTrace,
  };
  await persistChatTraceSafely(trace, {
    conversationId: conversation.conversationId,
    config,
    intent,
    subIntent,
    funnelStage: finalFunnel.stage,
    handledBy: "bot",
  });
  result.agentTrace = { ...agentTrace, timings: trace.snapshot() };
  return result;
}
