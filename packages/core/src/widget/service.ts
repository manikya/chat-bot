import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes, ok } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { runChatOrchestrator } from "../chat/orchestrator";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";

const WIDGET_EMBED_TEMPLATE = (apiKeyPrefix: string) =>
  `<script
  src="https://cdn.commercechat.com/widget/v1.js"
  data-api-key="${apiKeyPrefix}…"
  async
></script>`;

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
    embedCode: WIDGET_EMBED_TEMPLATE(prefix),
  });
}

export interface WidgetChatBody {
  sessionId: string;
  message: string;
  metadata?: Record<string, unknown>;
}

function buildSuggestedActions(toolResults?: Array<{ tool: string; success: boolean; [key: string]: unknown }>) {
  const search = toolResults?.find((t) => t.tool === "search_products" && t.success);
  const products = search?.products as Array<{ sku: string; name: string; price: number }> | undefined;
  if (!products?.length) return [];
  return products.slice(0, 3).map((p) => ({
    type: "product" as const,
    sku: p.sku,
    label: `${p.name} — $${p.price}`,
  }));
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

  return ok({
    sessionId: body.sessionId,
    conversationId: result.conversationId,
    reply: result.reply,
    suggestedActions: buildSuggestedActions(result.toolResults),
  });
}
