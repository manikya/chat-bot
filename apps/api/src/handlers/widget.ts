import { getWidgetConfig, widgetChat, loadConfig, type WidgetChatBody } from "@commercechat/core";
import { createApiKeyHandler, createTenantHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const configHandler = createTenantHandler(async (_event, tenantId) =>
  getWidgetConfig(tenantId, loadConfig())
);

export const chatHandler = createApiKeyHandler(async (event, tenantId) => {
  const body = parseBody<WidgetChatBody>(event);
  return widgetChat(tenantId, body, loadConfig());
});
