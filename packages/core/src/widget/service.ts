import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes, ok } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { runChatOrchestrator } from "../chat/orchestrator";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { buildWidgetEmbedPlaceholder } from "./embed";

export async function getWidgetConfig(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const [profileRes, configRes] = await Promise.all([
    db.send(
      new GetCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() },
      })
    ),
    db.send(
      new GetCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(tenantId), SK: Keys.config() },
      })
    ),
  ]);

  if (!profileRes.Item || !configRes.Item) {
    throw new ApiError(ErrorCodes.NOT_FOUND, "Tenant not found", 404);
  }

  const tenantConfig = configRes.Item;
  const prefix = (profileRes.Item.widgetApiKeyPrefix as string) ?? "pk_live_";

  return ok({
    storeName: profileRes.Item.storeName,
    greeting: tenantConfig.prompts?.greeting ?? "Hi! How can I help you shop today?",
    primaryColor: tenantConfig.widgetConfig?.primaryColor ?? "#4F46E5",
    position: tenantConfig.widgetConfig?.position ?? "bottom-right",
    suggestedQuestions: tenantConfig.widgetConfig?.suggestedQuestions ?? [],
    enabled: profileRes.Item.status === "active" || profileRes.Item.status === "trial",
    embedCode: buildWidgetEmbedPlaceholder(prefix, config),
  });
}

export interface WidgetChatBody {
  sessionId: string;
  message: string;
  metadata?: Record<string, unknown>;
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

function buildSuggestedActions(toolResults?: Array<{ tool: string; success: boolean; [key: string]: unknown }>) {
  const search = toolResults?.find((t) => t.tool === "search_products" && t.success);
  const products = search?.products as Array<{ sku: string; name: string; price: number; currency?: string }> | undefined;
  if (!products?.length) return [];
  return products.slice(0, 3).map((p) => ({
    type: "product" as const,
    sku: p.sku,
    label: `${p.name} — ${formatPrice(p.price, p.currency)}`,
  }));
}

function formatPrice(price: number, currency?: string) {
  const code = currency || "USD";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).format(price);
  } catch {
    return `${code} ${price}`;
  }
}

export function buildProductCards(toolResults?: Array<{ tool: string; success: boolean; [key: string]: unknown }>): WidgetProductCard[] {
  const search = toolResults?.find((t) => t.tool === "search_products" && t.success);
  const products = search?.products as
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
  if (!products?.length) return [];
  return products.slice(0, 3).map((p) => ({
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

export function toWidgetChatResponse(body: WidgetChatBody, result: Awaited<ReturnType<typeof runChatOrchestrator>>) {
  return {
    sessionId: body.sessionId,
    conversationId: result.conversationId,
    reply: result.reply,
    suggestedActions: buildSuggestedActions(result.toolResults),
    productCards: buildProductCards(result.toolResults),
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
    },
    config
  );

  return ok(toWidgetChatResponse(body, result));
}
