import { ApiError, ErrorCodes, type AuthContext, type ChatIntent, type ChatResult, type TenantConfig } from "@commercechat/shared";
import type { CoreConfig } from "../config";
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
} from "./conversation";
import { detectIntent, ragSourceTypesForIntent } from "./intent";
import { tenantHasPageVoiceVectors } from "../page-voice/service";
import { buildSystemPrompt } from "./prompts";
import { executeTool, toolsForIntent } from "./tools";
import { assertChannelEnabled, incrementUsage, reserveMessageQuota } from "./usage";
import { assertTenantOperational } from "../tenant/status";
import { notifyAgentInboundMessage, getHandlingMode } from "./agent-notify";

const MAX_TOOL_ROUNDS = 3;

export interface OrchestratorInput {
  channel: string;
  externalUserId: string;
  message: string;
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
  config: CoreConfig
): Promise<ScoredChunk[]> {
  let sourceTypes = ragSourceTypesForIntent(intent);
  const conversationEnabled = await tenantHasPageVoiceVectors(auth.tenantId, config);
  if (!conversationEnabled) {
    sourceTypes = sourceTypes.filter((t) => t !== "conversation");
  }

  const all: ScoredChunk[] = [];
  for (const sourceType of sourceTypes) {
    const hits = await retrieveKnowledge(auth, query, config, { topK: 3, sourceType });
    all.push(...hits);
    if (all.length >= 5) break;
  }
  if (all.length === 0) {
    return retrieveKnowledge(auth, query, config, { topK: 5 });
  }
  return all
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function generateFallbackReply(
  intent: ChatIntent,
  greeting: string,
  userMessage: string,
  ragChunks: ScoredChunk[],
  toolResults: Array<{ tool: string; success: boolean; result: unknown }>
): string {
  if (intent === "greeting") return greeting;

  const searchResult = toolResults.find((t) => t.tool === "search_products" && t.success);
  if (searchResult) {
    const data = searchResult.result as { products?: Array<{ name: string; price: number; sku: string }> };
    if (data.products?.length) {
      const list = data.products
        .map((p) => `• ${p.name} — $${p.price} (SKU: ${p.sku})`)
        .join("\n");
      return `Here's what I found:\n\n${list}`;
    }
  }

  if (ragChunks.length > 0 && ragChunks[0]!.score > 0.1) {
    const snippet = ragChunks
      .slice(0, 2)
      .map((h) => h.chunk.text.slice(0, 400))
      .join("\n\n");
    return `Based on our knowledge base:\n\n${snippet}`;
  }

  return `Thanks for your message. I'm still learning about this store — could you tell me more about what you're looking for? You asked: "${userMessage.slice(0, 120)}"`;
}

export async function runChatOrchestrator(
  auth: AuthContext,
  input: OrchestratorInput,
  config: CoreConfig
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

  await persistMessage(auth.tenantId, conversation, "inbound", "user", text, config, { intent });

  const ragChunks = await retrieveForIntent(auth, text, intent, config);
  const cart = await loadCart(auth.tenantId, conversation.conversationId, config);
  const systemPrompt = buildSystemPrompt(storeName, tenantConfig, ragChunks, cart, {
    channel: input.channel,
    timezone,
  });

  const llm = createLLMProvider(config);
  const tools = toolsForIntent(intent);
  const toolCtx = {
    auth,
    config,
    conversationId: conversation.conversationId,
    checkoutBaseUrl: tenantConfig.commerceConnector.checkoutBaseUrl,
    channel: input.channel,
    externalUserId: input.externalUserId,
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

  if (llm) {
    const model =
      tenantConfig.llmConfig.models[intent === "faq" ? "faq" : intent === "checkout" ? "checkout" : "product"] ??
      config.llmModel;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await llm.chat({
        model,
        messages,
        tools: tools.length ? tools : undefined,
        temperature: 0.4,
        maxOutputTokens: 800,
      });
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
  }

  if (!replyContent) {
    if (intent === "product" || intent === "checkout") {
      const { result, success } = await executeTool(
        "search_products",
        JSON.stringify({ query: text, limit: 5 }),
        toolCtx
      );
      toolResults.push({ tool: "search_products", success, result });
    }
    replyContent = generateFallbackReply(
      intent,
      tenantConfig.prompts.greeting,
      text,
      ragChunks,
      toolResults
    );
  }

  if (
    (intent === "product" || intent === "checkout") &&
    !toolResults.some((t) => t.tool === "search_products" && t.success)
  ) {
    const { result, success } = await executeTool(
      "search_products",
      JSON.stringify({ query: text, limit: 5 }),
      toolCtx
    );
    toolResults.push({ tool: "search_products", success, result });
  }

  await persistMessage(auth.tenantId, conversation, "outbound", "assistant", replyContent, config, {
    intent,
    llmProvider: llm?.name ?? "fallback",
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    toolCalls: toolResults.map((t) => t.tool),
  });

  await incrementUsage(auth.tenantId, config, {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  });

  return {
    conversationId: conversation.conversationId,
    reply: { type: "text", content: replyContent },
    toolResults: toolResults.map((t) => ({
      tool: t.tool,
      success: t.success,
      ...(typeof t.result === "object" && t.result ? (t.result as Record<string, unknown>) : {}),
    })),
    intent,
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    handledBy: "bot",
    handlingMode: "bot",
  };
}
