import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes, ok } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { addToCart } from "../chat/cart";
import { resolveConversation } from "../chat/conversation";
import { buildSuggestedCtas } from "../chat/cta";
import { runChatOrchestrator } from "../chat/orchestrator";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { buildWidgetEmbedPlaceholder } from "./embed";
import { assertWidgetChatRateLimit, assertWidgetConfigRateLimit } from "./rate-limit";
import { assertTenantOperational, resolveTenantProfile, tenantIsOperational } from "../tenant/status";
import { defaultSuggestedQuestions, marketFromTimezone, suggestedQuestionsForChatContext } from "../chat/locale";
import type { WidgetAction } from "@commercechat/shared";
import { listCatalogSearchHints, type CatalogSearchHints } from "../catalog/products";
import { createLLMProvider } from "../llm/provider";

function pageContext(pageUrl?: string): string[] {
  if (!pageUrl) return [];
  try {
    const url = new URL(pageUrl);
    return url.pathname
      .split(/[\/\-_]+/)
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length >= 3 && !["products", "product", "collections", "collection", "shop", "store"].includes(part))
      .slice(-4);
  } catch {
    return [];
  }
}

function normalizeStarter(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isBadInitialStarter(value: string): boolean {
  const normalized = normalizeStarter(value);
  if (!normalized) return true;
  if (/\b(budget|budget friendly|mid range|premium|lkr|rs|under|above|from|cheap|affordable|price)\b/i.test(normalized)) {
    return true;
  }
  if (/^(what are you looking for|what do you need|how can i help|choose a question)$/i.test(normalized)) return true;
  return false;
}

function fallbackInitialSuggestedQuestions(input: {
  defaults: string[];
  market?: "default" | "lk";
  pageUrl?: string;
  catalogHints?: CatalogSearchHints;
}): string[] {
  const { defaults, market = "default", pageUrl, catalogHints } = input;
  const candidates: string[] = [];
  const add = (value?: string) => {
    const text = value?.trim();
    if (text && !isBadInitialStarter(text)) candidates.push(text);
  };
  const pageTerms = pageContext(pageUrl);
  const catalogTerms = [
    ...(catalogHints?.starterIntents ?? []),
    ...(catalogHints?.productTypeHints ?? []).map((hint) => hint.term),
    ...(catalogHints?.offeringTypes ?? []),
    ...(catalogHints?.categories ?? []),
    ...(catalogHints?.materials ?? []).map((material) => `${material} items`),
    ...(catalogHints?.occasions ?? []).map((occasion) => `${occasion} gifts`),
    ...(catalogHints?.useCases ?? []),
  ];
  const pageMatch = catalogTerms.find((term) => {
    const normalized = normalizeStarter(term);
    return pageTerms.some((pageTerm) => normalized.includes(pageTerm) || pageTerm.includes(normalized));
  });
  if (pageMatch) add(`Show me ${pageMatch}`);
  for (const starter of catalogHints?.starterIntents ?? []) add(starter);
  for (const offering of catalogHints?.offeringTypes ?? []) add(`Show me ${offering}`);
  for (const category of catalogHints?.categories ?? []) add(`Show me ${category}`);
  for (const material of catalogHints?.materials ?? []) add(`Show me ${material} items`);
  for (const occasion of catalogHints?.occasions ?? []) add(`I need a ${occasion} gift`);
  for (const fallback of defaults) add(fallback);
  add(market === "lk" ? "Best sellers pennanna" : "Show best sellers");
  if ((catalogHints?.useCases ?? []).some((term) => normalizeStarter(term).includes("gift"))) add("I need help choosing a gift");
  add(catalogHints?.offeringMode === "services" ? "Compare service options" : "What options do you have?");

  const seen = new Set<string>();
  return candidates
    .filter((item) => {
      const key = normalizeStarter(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function parseSuggestedQuestions(content: string): string[] {
  const jsonText = content.trim().match(/\{[\s\S]*\}/)?.[0] ?? content.trim();
  try {
    const parsed = JSON.parse(jsonText) as { suggestedQuestions?: unknown };
    if (!Array.isArray(parsed.suggestedQuestions)) return [];
    const seen = new Set<string>();
    return parsed.suggestedQuestions
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length >= 3 && item.length <= 70)
      .filter((item) => !isBadInitialStarter(item))
      .filter((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function generateInitialSuggestedQuestions(input: {
  storeName: string;
  greeting: string;
  defaults: string[];
  market?: "default" | "lk";
  pageUrl?: string;
  catalogHints?: CatalogSearchHints;
  config: CoreConfig;
}): Promise<string[]> {
  const { storeName, greeting, defaults, market = "default", pageUrl, catalogHints, config } = input;
  const fallback = fallbackInitialSuggestedQuestions({ defaults, market, pageUrl, catalogHints });
  const llm = createLLMProvider(config);
  if (!llm) return fallback;
  try {
    const response = await llm.chat({
      model: config.llmModel,
      temperature: 0.2,
      maxOutputTokens: 180,
      messages: [
        {
          role: "system",
          content:
            "You generate initial commerce chat starter chips for tenants that may sell products, services, or both. Return ONLY compact JSON. " +
            "Create exactly 3 short customer messages that invite high-intent shopping behavior. " +
            "Prefer tenant-generated starterIntents and offeringTypes over generic support questions. Use the shopper's market/language style when obvious. " +
            "Never return budget-only or price-band starters like 'Show premium options', 'under LKR ...', or 'mid range'. " +
            "Never return generic question chips like 'What are you looking for?'. " +
            "Each item must be clickable as a user message, under 70 characters, and must not mention unavailable products. " +
            "Schema: {\"suggestedQuestions\":[\"...\"]}.",
        },
        {
          role: "user",
          content: JSON.stringify({
            storeName,
            greeting,
            market,
            pageTerms: pageContext(pageUrl),
            catalogHints: {
              productTypeHints: catalogHints?.productTypeHints?.slice(0, 12).map((hint) => ({
                term: hint.term,
                source: hint.source,
                inStockCount: hint.inStockCount,
              })) ?? [],
              offeringMode: catalogHints?.offeringMode ?? "unknown",
              starterIntents: catalogHints?.starterIntents?.slice(0, 10) ?? [],
              offeringTypes: catalogHints?.offeringTypes?.slice(0, 12) ?? [],
              audiences: catalogHints?.audiences?.slice(0, 10) ?? [],
              decisionFactors: catalogHints?.decisionFactors?.slice(0, 8) ?? [],
              categories: catalogHints?.categories?.slice(0, 12) ?? [],
              materials: catalogHints?.materials?.slice(0, 10) ?? [],
              occasions: catalogHints?.occasions?.slice(0, 10) ?? [],
              useCases: catalogHints?.useCases?.slice(0, 10) ?? [],
            },
            configuredFallbacks: defaults.slice(0, 5),
          }),
        },
      ],
    });
    const generated = parseSuggestedQuestions(response.content);
    return [...generated, ...fallback].slice(0, 3);
  } catch {
    return fallback;
  }
}

export async function getWidgetConfig(tenantId: string, config: CoreConfig, options?: { pageUrl?: string }) {
  await assertWidgetConfigRateLimit(tenantId, config);
  const profile = await resolveTenantProfile(tenantId, config);
  const db = getDocClient(config);
  const configRes = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.config() },
    })
  );

  if (!configRes.Item) {
    throw new ApiError(ErrorCodes.NOT_FOUND, "Tenant not found", 404);
  }

  const tenantConfig = configRes.Item;
  const prefix = (profile.widgetApiKeyPrefix as string) ?? "pk_live_";
  const status = profile.status as string;
  const storeName = String(profile.storeName ?? "CommerceChat");
  const greeting = tenantConfig.prompts?.greeting ?? "Hi! How can I help you shop today?";
  const market = marketFromTimezone(profile.timezone as string | undefined);
  const defaults = ((tenantConfig.widgetConfig?.suggestedQuestions as string[] | undefined) ?? defaultSuggestedQuestions(market)).filter(Boolean);
  const catalogHints = await listCatalogSearchHints(tenantId, config).catch(() => undefined);
  const suggestedQuestions = await generateInitialSuggestedQuestions({
    storeName,
    greeting,
    defaults,
    market,
    pageUrl: options?.pageUrl,
    catalogHints,
    config,
  });

  return ok({
    storeName,
    greeting,
    primaryColor: tenantConfig.widgetConfig?.primaryColor ?? "#4F46E5",
    position: tenantConfig.widgetConfig?.position ?? "bottom-right",
    suggestedQuestions,
    enabled:
      tenantIsOperational(status) && tenantConfig.widgetConfig?.widgetEnabled !== false,
    embedCode: buildWidgetEmbedPlaceholder(prefix, config),
  });
}

export interface WidgetChatBody {
  sessionId: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface WidgetCartBody {
  sessionId: string;
  sku: string;
  quantity?: number;
  variant?: string;
}

export interface WidgetProductCard {
  type: "product";
  sku: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  imageUrl?: string;
  imageUrls?: string[];
  url?: string;
  inStock: boolean;
  matchReasons?: string[];
}

const PRODUCT_TOOL_NAMES = ["search_products", "compare_products", "get_related_products"] as const;

function formatPrice(price: number, currency?: string) {
  const code = currency || "USD";
  const locale = code === "LKR" ? "en-LK" : "en";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(price);
  } catch {
    return `${code} ${price}`;
  }
}

type ToolRow = { tool: string; success: boolean; products?: Array<Record<string, unknown>> };

function shortProductDescription(description?: string): string | undefined {
  const clean = description
    ?.replace(/<[^>]*>/g, " ")
    .split(/\s+\|\s+/)
    .filter((part) => !/^(type|categories|category|sku|price|stock|url|image|images):/i.test(part.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return undefined;
  if (clean.length <= 90) return clean;
  return `${clean.slice(0, 87).replace(/[,.!?;:\s]+$/, "")}...`;
}

export function buildProductCards(toolResults?: ToolRow[]): WidgetProductCard[] {
  for (const toolName of PRODUCT_TOOL_NAMES) {
    const hit = toolResults?.find((t) => t.tool === toolName && t.success);
    const products = hit?.products as
      | Array<{
          sku: string;
          name: string;
          description?: string;
          price: number;
          currency?: string;
          imageUrl?: string;
          imageUrls?: string[];
          url?: string;
          inStock?: boolean;
          matchReasons?: string[];
        }>
      | undefined;
    if (!products?.length) continue;
    return products.slice(0, 5).map((p) => ({
      type: "product" as const,
      sku: p.sku,
      name: p.name,
      description: shortProductDescription(p.description),
      price: p.price,
      currency: p.currency || "USD",
      imageUrl: p.imageUrl,
      imageUrls: p.imageUrls,
      url: p.url,
      inStock: p.inStock !== false,
      matchReasons: p.matchReasons,
    }));
  }
  return [];
}

export function toWidgetChatResponse(
  body: WidgetChatBody,
  result: Awaited<ReturnType<typeof runChatOrchestrator>>,
  options?: { market?: "default" | "lk"; defaultQuestions?: string[] }
) {
  const suggestedActions: WidgetAction[] =
    result.suggestedActions ??
    buildSuggestedCtas({
      funnelStage: result.funnelStage,
      subIntent: result.subIntent,
      toolResults: (result.toolResults ?? []).map((t) => ({
        tool: t.tool,
        success: t.success,
        result: t,
      })),
      cart: null,
      channel: "web",
    });

  const suggestedQuestions = suggestedQuestionsForChatContext({
    market: options?.market,
    intent: result.intent,
    funnelStage: result.funnelStage,
    subIntent: result.subIntent,
    defaults: options?.defaultQuestions,
  });

  return {
    sessionId: body.sessionId,
    conversationId: result.conversationId,
    reply: result.reply,
    intent: result.intent,
    subIntent: result.subIntent,
    funnelStage: result.funnelStage,
    suggestedActions,
    suggestedQuestions,
    productCards: buildProductCards(result.toolResults as ToolRow[] | undefined),
    retrievedChunks: result.retrievedChunks,
    salesPlan: result.salesPlan,
    agentTrace: result.agentTrace,
  };
}

export function encodeSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function buildWidgetChatPayload(
  tenantId: string,
  body: WidgetChatBody,
  result: Awaited<ReturnType<typeof runChatOrchestrator>>,
  config: CoreConfig
) {
  const profile = await resolveTenantProfile(tenantId, config);
  const market = marketFromTimezone(profile.timezone as string | undefined);
  const configRes = await getDocClient(config).send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.config() },
    })
  );
  const defaultQuestions = (configRes.Item?.widgetConfig?.suggestedQuestions as string[] | undefined) ?? [];
  return toWidgetChatResponse(body, result, { market, defaultQuestions });
}

export async function widgetChat(tenantId: string, body: WidgetChatBody, config: CoreConfig) {
  if (!body.sessionId?.trim()) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "sessionId is required", 400);
  }
  if (!body.message?.trim()) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "message is required", 400);
  }

  await assertWidgetChatRateLimit(tenantId, body.sessionId.trim(), config);
  await assertTenantOperational(tenantId, config);

  const auth = {
    tenantId,
    userId: "widget",
    role: "viewer" as const,
    email: "",
  };

  const result = await runChatOrchestrator(
    auth,
    {
      channel: "web",
      externalUserId: body.sessionId.trim(),
      message: body.message.trim(),
      metadata: body.metadata,
    },
    config
  );

  return ok(await buildWidgetChatPayload(tenantId, body, result, config));
}

export async function widgetAddToCart(tenantId: string, body: WidgetCartBody, config: CoreConfig) {
  if (!body.sessionId?.trim()) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "sessionId is required", 400);
  }
  if (!body.sku?.trim()) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "sku is required", 400);
  }

  const quantity = Math.max(1, Math.min(99, Number(body.quantity ?? 1)));
  await assertWidgetChatRateLimit(tenantId, body.sessionId.trim(), config);
  await assertTenantOperational(tenantId, config);

  const conversation = await resolveConversation(
    tenantId,
    "web",
    body.sessionId.trim(),
    config
  );

  const outcome = await addToCart(
    tenantId,
    conversation.conversationId,
    body.sku.trim(),
    quantity,
    body.variant,
    config
  );

  if (!outcome.success) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, outcome.error, 400);
  }

  const item = outcome.cart.items.find((i) => i.sku === body.sku.trim());
  const message = item
    ? `Added ${item.name} to your cart (${quantity} × ${formatPrice(item.unitPrice, outcome.cart.currency)}).`
    : `Added item to your cart.`;

  return ok({
    sessionId: body.sessionId,
    conversationId: conversation.conversationId,
    sku: body.sku.trim(),
    cart: {
      items: outcome.cart.items,
      subtotal: outcome.cart.subtotal,
      currency: outcome.cart.currency,
    },
    message,
  });
}
