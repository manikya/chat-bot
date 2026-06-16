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
import type { WidgetAction } from "@commercechat/shared";

export async function getWidgetConfig(tenantId: string, config: CoreConfig) {
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

  return ok({
    storeName: profile.storeName,
    greeting: tenantConfig.prompts?.greeting ?? "Hi! How can I help you shop today?",
    primaryColor: tenantConfig.widgetConfig?.primaryColor ?? "#4F46E5",
    position: tenantConfig.widgetConfig?.position ?? "bottom-right",
    suggestedQuestions: tenantConfig.widgetConfig?.suggestedQuestions ?? [],
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
        }>
      | undefined;
    if (!products?.length) continue;
    return products.slice(0, 5).map((p) => ({
      type: "product" as const,
      sku: p.sku,
      name: p.name,
      description: p.description,
      price: p.price,
      currency: p.currency || "USD",
      imageUrl: p.imageUrl,
      imageUrls: p.imageUrls,
      url: p.url,
      inStock: p.inStock !== false,
    }));
  }
  return [];
}

export function toWidgetChatResponse(body: WidgetChatBody, result: Awaited<ReturnType<typeof runChatOrchestrator>>) {
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

  return {
    sessionId: body.sessionId,
    conversationId: result.conversationId,
    reply: result.reply,
    intent: result.intent,
    subIntent: result.subIntent,
    funnelStage: result.funnelStage,
    suggestedActions,
    productCards: buildProductCards(result.toolResults as ToolRow[] | undefined),
  };
}

export function encodeSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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

  return ok(toWidgetChatResponse(body, result));
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
