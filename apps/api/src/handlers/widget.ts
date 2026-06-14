import {
  assertWidgetChatRateLimit,
  assertTenantOperational,
  encodeSseEvent,
  getWidgetConfig,
  loadConfig,
  runChatOrchestrator,
  toWidgetChatResponse,
  verifyWidgetApiKey,
  widgetChat,
  type WidgetChatBody,
} from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createApiKeyHandler, createTenantHandler } from "../lib/handler";
import { corsHeaders, getApiKey, handleError, parseBody } from "../lib/apigw";

export const configHandler = createTenantHandler(async (_event, tenantId) =>
  getWidgetConfig(tenantId, loadConfig())
);

export const chatHandler = createApiKeyHandler(async (event, tenantId) => {
  const body = parseBody<WidgetChatBody>(event);
  return widgetChat(tenantId, body, loadConfig());
});

export const streamHandler = async (event: Parameters<typeof chatHandler>[0]) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }

  try {
    const config = loadConfig();
    const apiKey = getApiKey(event);
    if (!apiKey) throw new ApiError(ErrorCodes.UNAUTHORIZED, "Missing X-API-Key header", 401);
    const tenantId = await verifyWidgetApiKey(apiKey, config);
    const body = parseBody<WidgetChatBody>(event);
    if (!body.sessionId?.trim()) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "sessionId is required", 400);
    }
    if (!body.message?.trim()) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "message is required", 400);
    }

    const sessionId = body.sessionId.trim();
    await assertWidgetChatRateLimit(tenantId, sessionId, config);
    await assertTenantOperational(tenantId, config);

    const result = await runChatOrchestrator(
      { tenantId, userId: "widget", role: "viewer", email: "" },
      {
        channel: "web",
        externalUserId: sessionId,
        message: body.message.trim(),
      },
      config
    );
    const payload = toWidgetChatResponse(body, result);
    const text = payload.reply.content;
    const chunks = text.match(/.{1,24}(?:\s|$)|\S+/g) ?? [text];
    const bodyText =
      encodeSseEvent("start", {
        sessionId: payload.sessionId,
        conversationId: payload.conversationId,
      }) +
      encodeSseEvent("typing", { active: true }) +
      chunks.map((chunk) => encodeSseEvent("token", { text: chunk })).join("") +
      payload.productCards.map((card) => encodeSseEvent("product_card", card)).join("") +
      encodeSseEvent("done", {
        sessionId: payload.sessionId,
        conversationId: payload.conversationId,
        reply: payload.reply,
        suggestedActions: payload.suggestedActions,
        productCards: payload.productCards,
      });

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
      body: bodyText,
    };
  } catch (error) {
    return handleError(error);
  }
};
