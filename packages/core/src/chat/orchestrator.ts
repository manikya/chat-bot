import { ApiError, ErrorCodes, type AuthContext, type ChatIntent, type ChatResult, type ChatSubIntent, type TenantConfig, type WidgetAction } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { listCatalogSearchHints } from "../catalog/products";
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
  persistMessage,
  resolveConversation,
  updateConversationFunnel,
} from "./conversation";
import { detectIntent, detectSubIntent, isGreetingOnlyMessage, messageMentionsProducts, ragSourceTypesForIntent } from "./intent";
import { resolveFunnelContext } from "./funnel";
import { extractQualificationFromMessage, mergeQualification } from "./qualification";
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
import { appendCtaPromptLine, applyEngagementQuestion, buildSuggestedCtas } from "./cta";
import { buildProductResultsIntro, planConversationMove } from "./conversation-policy";
import { discoverQualifyPrompt, shouldGateProductSearch } from "./discover-gate";
import { buildProductSearchQuery } from "./product-query";
import {
  handleStaleCartMessage,
  isCartAbandonmentReply,
  isCartContinuationReply,
  shouldPauseForStaleCart,
} from "./stale-cart";
import { executeTool, toolsForIntent } from "./tools";
import { assertChannelEnabled, incrementUsage, reserveMessageQuota } from "./usage";
import { assertTenantOperational } from "../tenant/status";
import { notifyAgentInboundMessage, getHandlingMode } from "./agent-notify";
import { marketFromTimezone } from "./locale";

const MAX_TOOL_ROUNDS = 3;

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
  message?: string,
  options?: { subIntent?: ChatSubIntent; objectionsRaised?: string[] }
): Promise<ScoredChunk[]> {
  let sourceTypes = ragSourceTypesForIntent(intent, message, options?.subIntent);
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
  message: string,
  gateProductSearch: boolean
): boolean {
  if (gateProductSearch || isGreetingOnlyMessage(message) || intent === "greeting") return false;
  return intent === "product" || intent === "checkout" || messageMentionsProducts(message);
}

function isCatalogOverviewQuestion(message: string): boolean {
  const normalized = message.toLowerCase().replace(/\btyoe\b/g, "type");
  return /\b(what\s+(type|types|kind|kinds)\s+of\s+(products|items)|what\s+(products|items)\s+do\s+you\s+have|what\s+do\s+you\s+(sell|have)|categories|product\s+categories)\b/i.test(
    normalized
  );
}

function buildCatalogOverview(input: {
  categories?: string[];
}): { reply: string; actions: WidgetAction[] } {
  const categories = (input.categories ?? [])
    .filter((category) => !/uncategorized|general/i.test(category))
    .slice(0, 6);
  const sample = categories.length ? categories.join(", ") : "gifts, home decor, and special occasion items";
  return {
    reply: `We have ${sample}. Who are you shopping for, and what budget should I stay within?`,
    actions: categories.slice(0, 3).map((category) => ({
      type: "message" as const,
      label: category,
      message: `Show me ${category}`,
    })),
  };
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

export async function runChatOrchestrator(
  auth: AuthContext,
  input: OrchestratorInput,
  config: CoreConfig,
  options?: OrchestratorOptions
): Promise<ChatResult> {
  const text = input.message?.trim();
  if (!text) throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Message is required", 400);

  await assertChannelEnabled(auth.tenantId, input.channel, config);
  if (input.channel !== "test") {
    await reserveMessageQuota(auth.tenantId, config);
  }

  const { storeName, timezone, config: tenantConfig } = await loadTenantContext(auth, config);
  const conversation = await resolveConversation(
    auth.tenantId,
    input.channel,
    input.externalUserId,
    config
  );

  const handlingMode = getHandlingMode(conversation);
  if (handlingMode === "human") {
    await persistMessage(auth.tenantId, conversation, "inbound", "user", text, config, {
      awaitingAgent: true,
    });
    await notifyAgentInboundMessage(auth.tenantId, conversation, text, config);

    const webAck =
      input.channel === "web"
        ? "Thanks — our team has been notified and will reply shortly."
        : "";

    return {
      conversationId: conversation.conversationId,
      reply: { type: "text", content: webAck },
      handledBy: "human",
      handlingMode: "human",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  const history = await loadMessageHistory(auth.tenantId, conversation.conversationId, config);
  const isFirstMessage = history.length === 0;
  const intent = detectIntent(text, isFirstMessage);
  let cart = await loadCart(auth.tenantId, conversation.conversationId, config);
  const funnel = resolveFunnelContext(conversation, {
    message: text,
    intent,
    cartItemCount: cart?.items.length ?? 0,
  });
  const subIntent = detectSubIntent(text, intent, funnel.stage);
  const market = marketFromTimezone(timezone);
  const pageUrl = typeof input.metadata?.pageUrl === "string" ? input.metadata.pageUrl : undefined;
  const catalogHints =
    intent === "product" || messageMentionsProducts(text)
      ? await listCatalogSearchHints(auth.tenantId, config)
      : undefined;
  const qualification = mergeQualification(
    conversation.qualification ?? funnel.qualification,
    extractQualificationFromMessage(text, market, {
      catalogCategories: catalogHints?.categories,
      catalogTags: catalogHints?.tags,
    })
  );
  const funnelOrQualChanged =
    funnel.changed ||
    JSON.stringify(qualification) !== JSON.stringify(conversation.qualification ?? {}) ||
    conversation.lastIntent !== intent ||
    conversation.lastSubIntent !== subIntent;

  if (funnelOrQualChanged) {
    await updateConversationFunnel(
      auth.tenantId,
      conversation,
      funnel.stage,
      config,
      qualification,
      intent,
      subIntent
    );
    conversation.funnelStage = funnel.stage;
    conversation.qualification = qualification;
    conversation.lastIntent = intent;
    conversation.lastSubIntent = subIntent;
  }

  await persistMessage(auth.tenantId, conversation, "inbound", "user", text, config, {
    intent,
    subIntent,
    funnelStage: funnel.stage,
  });

  if (cart?.items.length && (shouldPauseForStaleCart(text, conversation, cart) || isCartAbandonmentReply(text))) {
    const staleOutcome = await handleStaleCartMessage({
      auth,
      conversation,
      cart,
      message: text,
      config,
    });
    if (staleOutcome.handled && staleOutcome.reply) {
      cart = staleOutcome.cart ?? cart;
      const replyContent = compactReplyText(staleOutcome.reply, { channel: input.channel, maxWords: 35 });
      const suggestedActions =
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
      await persistMessage(auth.tenantId, conversation, "outbound", "assistant", replyContent, config, {
        intent,
        subIntent,
        funnelStage: cart?.items.length ? "cart" : "discover",
        staleCartCheck: true,
      });
      await incrementUsage(auth.tenantId, config, { inputTokens: 0, outputTokens: 0 });
      return {
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
    }
  }

  if (isCatalogOverviewQuestion(text)) {
    const overview = buildCatalogOverview({
      categories: catalogHints?.categories,
    });
    const replyContent = compactReplyText(overview.reply, { channel: input.channel, maxWords: 35 });
    if (conversation.funnelStage !== "discover") {
      await updateConversationFunnel(
        auth.tenantId,
        conversation,
        "discover",
        config,
        qualification,
        intent,
        subIntent
      );
      conversation.funnelStage = "discover";
    }
    await persistMessage(auth.tenantId, conversation, "outbound", "assistant", replyContent, config, {
      intent,
      subIntent,
      funnelStage: "discover",
      catalogOverview: true,
    });
    await incrementUsage(auth.tenantId, config, { inputTokens: 0, outputTokens: 0 });
    return {
      conversationId: conversation.conversationId,
      reply: { type: "text", content: replyContent },
      toolResults: [],
      intent,
      subIntent,
      funnelStage: "discover",
      usage: { inputTokens: 0, outputTokens: 0 },
      handledBy: "bot",
      handlingMode: "bot",
      suggestedActions: overview.actions,
    };
  }

  const productAwareQuery = buildProductSearchQuery({
    message: text,
    qualification,
    pageUrl,
  });
  const ragQuery = intent === "product" || messageMentionsProducts(text) ? productAwareQuery : text;
  const ragChunks = await retrieveForIntent(auth, ragQuery, intent, config, text, {
    subIntent,
    objectionsRaised: qualification.objectionsRaised,
  });
  const currency = tenantConfig.commerceConnector?.currency ?? (market === "lk" ? "LKR" : "USD");
  const gateProductSearch = shouldGateProductSearch({
    funnelStage: funnel.stage,
    subIntent,
    qualification,
    message: text,
    market,
  });
  const conversationPolicy = planConversationMove({
    message: text,
    intent,
    subIntent,
    funnelStage: funnel.stage,
    qualification,
    gateProductSearch,
    market,
    catalogHints,
  });
  const systemPrompt = buildSystemPrompt(storeName, tenantConfig, ragChunks, cart, {
    channel: input.channel,
    timezone,
    intent,
    subIntent,
    funnelStage: funnel.stage,
    qualification,
    pageUrl,
  });

  const llm = createLLMProvider(config);
  const tools = toolsForIntent(intent, text, funnel.stage, subIntent, { gateProductSearch });
  const toolCtx = {
    auth,
    config,
    conversationId: conversation.conversationId,
    checkoutBaseUrl: tenantConfig.commerceConnector.checkoutBaseUrl,
    channel: input.channel,
    externalUserId: input.externalUserId,
    qualification,
    pageUrl,
  };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...historyToChatMessages(history).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: text },
  ];

  const toolResults: Array<{ tool: string; success: boolean; result: unknown }> = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let replyContent = "";

  if (llm && !(gateProductSearch && conversationPolicy.reply)) {
    const model =
      tenantConfig.llmConfig.models[intent === "faq" ? "faq" : intent === "checkout" ? "checkout" : "product"] ??
      config.llmModel;
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
          ? await llm.streamChat(request, async (event) => {
              if (event.type === "token") await options.onToken?.(event.text);
            })
          : await llm.chat(request);
      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;

      if (response.toolCalls?.length) {
        messages.push({
          role: "assistant",
          content: response.content || null,
          tool_calls: response.toolCalls,
        });

        for (const tc of response.toolCalls) {
          const { result, success } = await executeTool(tc.name, tc.arguments, toolCtx);
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
      break;
    }

    if (!replyContent && intent === "greeting") {
      replyContent = tenantConfig.prompts.greeting;
    }

    if (gateProductSearch && replyContent && replyContent.split(/\s+/).length > 100) {
      replyContent = discoverQualifyPrompt(text, market, catalogHints);
    }
  }

  if (!replyContent) {
    if (conversationPolicy.reply) {
      replyContent = conversationPolicy.reply;
    } else if (gateProductSearch) {
      replyContent = discoverQualifyPrompt(text, market, catalogHints);
    } else if (shouldRunProductSearch(intent, text, gateProductSearch)) {
      const { result, success } = await executeTool(
        "search_products",
        JSON.stringify({
          query: text,
          limit: 3,
          category: qualification.category,
          maxPrice: qualification.budget?.max,
          minPrice: qualification.budget?.min,
        }),
        toolCtx
      );
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
    shouldRunProductSearch(intent, text, gateProductSearch) &&
    !toolResults.some((t) => t.tool === "search_products" && t.success)
  ) {
    const { result, success } = await executeTool(
      "search_products",
      JSON.stringify({
        query: text,
        limit: 3,
        category: qualification.category,
        maxPrice: qualification.budget?.max,
        minPrice: qualification.budget?.min,
      }),
      toolCtx
    );
    toolResults.push({ tool: "search_products", success, result });
  }

  if (
    !gateProductSearch &&
    productSearchWasEmpty(toolResults) &&
    (intent === "product" || subIntent === "product_browse" || subIntent === "product_compare")
  ) {
    replyContent = buildNoProductResultsReply({
      query: text,
      category: qualification.category,
      maxPrice: qualification.budget?.max,
      minPrice: qualification.budget?.min,
      currency,
      channel: input.channel,
    });
  }

  replyContent = compactReplyText(sanitizeReplyText(replyContent, input.channel), {
    channel: input.channel,
    maxWords: gateProductSearch ? 35 : undefined,
  });
  const surfaceProducts = !gateProductSearch && intent !== "greeting" && !isGreetingOnlyMessage(text);
  const finalToolResults = surfaceProducts ? toolResults : stripProductToolResults(toolResults);
  const finalProducts = extractProductHitsFromTools(finalToolResults);
  if (input.channel === "web" && finalProducts.length) {
    replyContent = buildProductResultsIntro({
      qualification,
      productCount: finalProducts.length,
      market,
    });
  }
  replyContent = enrichReplyWithProductSearch(replyContent, finalToolResults, currency, {
    channel: input.channel,
    skipListAppend: gateProductSearch || !surfaceProducts,
  });

  const refreshedCart = await loadCart(auth.tenantId, conversation.conversationId, config);
  let finalFunnel = resolveFunnelContext(conversation, {
    message: text,
    intent,
    cartItemCount: refreshedCart?.items.length ?? 0,
  });
  if (toolResults.some((t) => t.tool === "create_checkout_link" && t.success)) {
    finalFunnel = {
      ...finalFunnel,
      stage: "checkout",
      changed: finalFunnel.stage !== "checkout",
    };
  }
  if (finalFunnel.stage !== funnel.stage) {
    await updateConversationFunnel(
      auth.tenantId,
      conversation,
      finalFunnel.stage,
      config,
      qualification,
      intent,
      subIntent
    );
    conversation.funnelStage = finalFunnel.stage;
    conversation.lastIntent = intent;
    conversation.lastSubIntent = subIntent;
  }

  let suggestedActions =
    gateProductSearch && conversationPolicy.suggestedActions?.length
      ? conversationPolicy.suggestedActions
      : buildSuggestedCtas({
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
        });
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
  }
  replyContent = appendCtaPromptLine(replyContent, suggestedActions, { gateProductSearch });
  replyContent = compactReplyText(replyContent, { channel: input.channel });

  await persistMessage(auth.tenantId, conversation, "outbound", "assistant", replyContent, config, {
    intent,
    subIntent,
    funnelStage: finalFunnel.stage,
    llmProvider: llm?.name ?? "fallback",
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    toolCalls: finalToolResults.map((t) => t.tool),
  });

  await incrementUsage(auth.tenantId, config, {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  });

  return {
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
  };
}
