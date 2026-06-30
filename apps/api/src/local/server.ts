import { readFileSync, existsSync } from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMockServerApp } from "@commercechat/mock-api/server";
import { handler as healthHandler } from "../handlers/health";
import { handler as signupHandler } from "../handlers/auth-signup";
import { handler as loginHandler } from "../handlers/auth-login";
import { handler as meHandler } from "../handlers/auth-me";
import { handler as verifyHandler } from "../handlers/auth-verify-email";
import { handler as refreshHandler } from "../handlers/auth-refresh";
import { handler as logoutHandler } from "../handlers/auth-logout";
import { handler as forgotPasswordHandler } from "../handlers/auth-forgot-password";
import { handler as resetPasswordHandler } from "../handlers/auth-reset-password";
import { handler as resendVerificationHandler } from "../handlers/auth-resend-verification";
import { handler as authInviteHandler } from "../handlers/auth-invite";
import { handler as authAcceptInviteHandler } from "../handlers/auth-accept-invite";
import { handler as tenantMeHandler } from "../handlers/tenant-me";
import { handler as tenantLogoHandler } from "../handlers/tenant-logo";
import { handler as tenantConfigHandler } from "../handlers/tenant-config";
import { handler as tenantLimitsHandler } from "../handlers/tenant-limits";
import { handler as onboardingHandler } from "../handlers/onboarding";
import { handler as onboardingTestChatHandler } from "../handlers/onboarding-test-chat";
import { handler as knowledgeSourcesHandler } from "../handlers/knowledge-sources";
import { handler as knowledgeSyncHandler } from "../handlers/knowledge-sync";
import { handler as knowledgeJobsHandler } from "../handlers/knowledge-jobs";
import { handler as knowledgeFaqHandler } from "../handlers/knowledge-faq";
import { handler as knowledgePageVoiceHandler } from "../handlers/knowledge-page-voice";
import { handler as knowledgeDetectPlatformHandler } from "../handlers/knowledge-detect-platform";
import { handler as mobileAiSnapshotHandler } from "../handlers/mobile-ai-snapshot";
import { handler as commerceProductsHandler } from "../handlers/commerce-products";
import {
  connectHandler as wordpressConnectHandler,
  disconnectHandler as wordpressDisconnectHandler,
  statusHandler as wordpressStatusHandler,
  syncHandler as wordpressSyncHandler,
  widgetBootstrapHandler as wordpressWidgetBootstrapHandler,
  widgetPatchHandler as wordpressWidgetPatchHandler,
  widgetSettingsHandler as wordpressWidgetSettingsHandler,
} from "../handlers/commerce-wordpress";
import {
  connectHandler as shopifyConnectHandler,
  connectStoreHandler as shopifyConnectStoreHandler,
  disconnectHandler as shopifyDisconnectHandler,
  statusHandler as shopifyStatusHandler,
  syncHandler as shopifySyncHandler,
  widgetBootstrapHandler as shopifyWidgetBootstrapHandler,
  widgetSettingsHandler as shopifyWidgetSettingsHandler,
  widgetPatchHandler as shopifyWidgetPatchHandler,
} from "../handlers/commerce-shopify";
import { handler as teamHandler } from "../handlers/team";
import { deleteHandler as teamDeleteHandler, patchHandler as teamPatchHandler } from "../handlers/team-member";
import { presignHandler as logoPresignHandler, completeHandler as logoCompleteHandler } from "../handlers/tenant-logo-presign";
import { handler as chatApiHandler } from "../handlers/chat-api";
import { handler as tenantUsageHandler } from "../handlers/tenant-usage";
import { handler as tenantWidgetKeyHandler } from "../handlers/tenant-widget-key";
import {
  aiWalletTopupHandler as platformTenantAiWalletTopupHandler,
  getHandler as platformTenantGetHandler,
  listHandler as platformTenantListHandler,
  patchHandler as platformTenantPatchHandler,
} from "../handlers/platform-tenants";
import {
  loginHandler as platformLoginHandler,
  meHandler as platformMeHandler,
} from "../handlers/platform-auth";
import {
  createUserHandler as platformUserCreateHandler,
  listHandler as platformUserListHandler,
  patchHandler as platformUserPatchHandler,
} from "../handlers/platform-users";
import { handler as conversationsHandler } from "../handlers/conversations";
import { configHandler as widgetConfigHandler, chatHandler as widgetChatHandler, cartHandler as widgetCartHandler, streamHandler as widgetStreamHandler } from "../handlers/widget";
import { handler as dashboardStatsHandler } from "../handlers/dashboard-stats";
import { handler as analyticsHandler } from "../handlers/analytics";
import { handler as devicesHandler } from "../handlers/devices";
import { handler as webhookMetaHandler } from "../handlers/webhook-meta";
import { handler as cronMetaTokenRefreshHandler } from "../handlers/cron-meta-token-refresh";
import { handler as cronBillingLifecycleHandler } from "../handlers/cron-billing-lifecycle";
import { handler as socialContentDailyHandler } from "../handlers/social-content-daily";
import { handler as cronSocialContentDailyHandler } from "../handlers/cron-social-content-daily";
import {
  assertTenantOperational,
  assertWidgetChatRateLimit,
  buildWidgetChatPayload,
  encodeSseEvent,
  loadConfig,
  runChatOrchestrator,
  verifyWidgetApiKey,
} from "@commercechat/core";
import { handler as webhookPaymentHandler } from "../handlers/webhook-payment";
import { woocommerceCatalogHandler } from "../handlers/webhook-commerce";
import {
  plansHandler as billingPlansHandler,
  subscriptionHandler as billingSubscriptionHandler,
  overviewHandler as billingOverviewHandler,
  checkoutHandler as billingCheckoutHandler,
  cancelHandler as billingCancelHandler,
  reactivateHandler as billingReactivateHandler,
  aiWalletHandler as billingAiWalletHandler,
  aiWalletTopupHandler as billingAiWalletTopupHandler,
  aiWalletResumeHandler as billingAiWalletResumeHandler,
} from "../handlers/billing";
import {
  listHandler as channelsListHandler,
  connectHandler as channelsConnectHandler,
  connectMessengerHandler as channelsConnectMessengerHandler,
  connectInstagramHandler as channelsConnectInstagramHandler,
  disconnectHandler as channelsDisconnectHandler,
  healthHandler as channelsHealthHandler,
  devConnectHandler as channelsDevConnectHandler,
  messengerDevConnectHandler as channelsMessengerDevConnectHandler,
  devStatusHandler as channelsDevStatusHandler,
} from "../handlers/channels";
import { corsHeaders, matchPathParams } from "../lib/apigw";
import { toApigwEvent } from "./event";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";

type LambdaHandler = (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyResultV2>;

const REAL_ROUTES: Array<{
  method: string;
  path: string;
  handler: LambdaHandler;
}> = [
  { method: "GET", path: "/health", handler: healthHandler },
  { method: "GET", path: "/webhooks/meta", handler: webhookMetaHandler },
  { method: "POST", path: "/webhooks/meta", handler: webhookMetaHandler },
  { method: "POST", path: "/webhooks/payment", handler: webhookPaymentHandler },
  { method: "POST", path: "/webhooks/commerce/woocommerce", handler: woocommerceCatalogHandler },
  { method: "GET", path: "/api/v1/billing/plans", handler: billingPlansHandler },
  { method: "GET", path: "/api/v1/billing/subscription", handler: billingSubscriptionHandler },
  { method: "GET", path: "/api/v1/billing/overview", handler: billingOverviewHandler },
  { method: "GET", path: "/api/v1/billing/ai-wallet", handler: billingAiWalletHandler },
  { method: "POST", path: "/api/v1/billing/ai-wallet/topup", handler: billingAiWalletTopupHandler },
  { method: "POST", path: "/api/v1/billing/ai-wallet/resume", handler: billingAiWalletResumeHandler },
  { method: "POST", path: "/api/v1/billing/checkout", handler: billingCheckoutHandler },
  { method: "POST", path: "/api/v1/billing/cancel", handler: billingCancelHandler },
  { method: "POST", path: "/api/v1/billing/reactivate", handler: billingReactivateHandler },
  { method: "POST", path: "/auth/signup", handler: signupHandler },
  { method: "POST", path: "/auth/login", handler: loginHandler },
  { method: "GET", path: "/auth/me", handler: meHandler },
  { method: "POST", path: "/auth/verify-email", handler: verifyHandler },
  { method: "POST", path: "/auth/refresh", handler: refreshHandler },
  { method: "POST", path: "/auth/logout", handler: logoutHandler },
  { method: "POST", path: "/auth/forgot-password", handler: forgotPasswordHandler },
  { method: "POST", path: "/auth/reset-password", handler: resetPasswordHandler },
  { method: "POST", path: "/auth/resend-verification", handler: resendVerificationHandler },
  { method: "POST", path: "/auth/invite", handler: authInviteHandler },
  { method: "POST", path: "/auth/accept-invite", handler: authAcceptInviteHandler },
  { method: "POST", path: "/platform/auth/login", handler: platformLoginHandler },
  { method: "GET", path: "/platform/auth/me", handler: platformMeHandler },
  { method: "GET", path: "/api/v1/tenants/me", handler: tenantMeHandler },
  { method: "PATCH", path: "/api/v1/tenants/me", handler: tenantMeHandler },
  { method: "POST", path: "/api/v1/tenants/me/logo", handler: tenantLogoHandler },
  { method: "POST", path: "/api/v1/tenants/me/logo/presign", handler: logoPresignHandler },
  { method: "POST", path: "/api/v1/tenants/me/logo/complete", handler: logoCompleteHandler },
  { method: "GET", path: "/api/v1/tenants/me/config", handler: tenantConfigHandler },
  { method: "PATCH", path: "/api/v1/tenants/me/config", handler: tenantConfigHandler },
  { method: "GET", path: "/api/v1/tenants/me/limits", handler: tenantLimitsHandler },
  { method: "GET", path: "/api/v1/tenants/me/usage", handler: tenantUsageHandler },
  { method: "POST", path: "/api/v1/tenants/me/widget/regenerate-key", handler: tenantWidgetKeyHandler },
  { method: "GET", path: "/api/v1/platform/tenants", handler: platformTenantListHandler },
  { method: "GET", path: "/api/v1/platform/users", handler: platformUserListHandler },
  { method: "POST", path: "/api/v1/platform/users", handler: platformUserCreateHandler },
  { method: "GET", path: "/api/v1/conversations", handler: conversationsHandler },
  { method: "GET", path: "/api/v1/widget/config", handler: widgetConfigHandler },
  { method: "POST", path: "/api/v1/widget/chat", handler: widgetChatHandler },
  { method: "POST", path: "/api/v1/widget/cart", handler: widgetCartHandler },
  { method: "POST", path: "/api/v1/widget/chat/stream", handler: widgetStreamHandler },
  { method: "POST", path: "/api/v1/chat", handler: chatApiHandler },
  { method: "GET", path: "/api/v1/onboarding", handler: onboardingHandler },
  { method: "PATCH", path: "/api/v1/onboarding/step", handler: onboardingHandler },
  { method: "POST", path: "/api/v1/onboarding/test-chat", handler: onboardingTestChatHandler },
  { method: "GET", path: "/api/v1/knowledge/sources", handler: knowledgeSourcesHandler },
  { method: "POST", path: "/api/v1/knowledge/sources", handler: knowledgeSourcesHandler },
  { method: "GET", path: "/api/v1/knowledge/faq", handler: knowledgeFaqHandler },
  { method: "POST", path: "/api/v1/knowledge/faq", handler: knowledgeFaqHandler },
  { method: "GET", path: "/api/v1/knowledge/page-voice/export", handler: knowledgePageVoiceHandler },
  { method: "GET", path: "/api/v1/knowledge/page-voice", handler: knowledgePageVoiceHandler },
  { method: "PATCH", path: "/api/v1/knowledge/page-voice", handler: knowledgePageVoiceHandler },
  { method: "POST", path: "/api/v1/knowledge/page-voice/sync", handler: knowledgePageVoiceHandler },
  { method: "POST", path: "/api/v1/knowledge/page-voice/upload", handler: knowledgePageVoiceHandler },
  { method: "POST", path: "/api/v1/knowledge/detect-platform", handler: knowledgeDetectPlatformHandler },
  { method: "GET", path: "/api/v1/mobile-ai/snapshot", handler: mobileAiSnapshotHandler },
  { method: "GET", path: "/api/v1/mobile-ai/snapshot/manifest", handler: mobileAiSnapshotHandler },
  { method: "GET", path: "/api/v1/mobile-ai/snapshot/chunks", handler: mobileAiSnapshotHandler },
  { method: "GET", path: "/api/v1/commerce/products", handler: commerceProductsHandler },
  { method: "POST", path: "/api/v1/commerce/products/regenerate-attributes", handler: commerceProductsHandler },
  { method: "GET", path: "/api/v1/commerce/wordpress/status", handler: wordpressStatusHandler },
  { method: "POST", path: "/api/v1/commerce/wordpress/connect", handler: wordpressConnectHandler },
  { method: "POST", path: "/api/v1/commerce/wordpress/sync", handler: wordpressSyncHandler },
  { method: "DELETE", path: "/api/v1/commerce/wordpress", handler: wordpressDisconnectHandler },
  { method: "GET", path: "/api/v1/commerce/wordpress/widget", handler: wordpressWidgetSettingsHandler },
  { method: "PATCH", path: "/api/v1/commerce/wordpress/widget", handler: wordpressWidgetPatchHandler },
  { method: "GET", path: "/api/v1/commerce/wordpress/widget-bootstrap", handler: wordpressWidgetBootstrapHandler },
  { method: "GET", path: "/api/v1/commerce/shopify/status", handler: shopifyStatusHandler },
  { method: "POST", path: "/api/v1/commerce/shopify/connect", handler: shopifyConnectHandler },
  { method: "POST", path: "/api/v1/commerce/shopify/connect-store", handler: shopifyConnectStoreHandler },
  { method: "POST", path: "/api/v1/commerce/shopify/sync", handler: shopifySyncHandler },
  { method: "DELETE", path: "/api/v1/commerce/shopify", handler: shopifyDisconnectHandler },
  { method: "GET", path: "/api/v1/commerce/shopify/widget-bootstrap", handler: shopifyWidgetBootstrapHandler },
  { method: "GET", path: "/api/v1/commerce/shopify/widget", handler: shopifyWidgetSettingsHandler },
  { method: "PATCH", path: "/api/v1/commerce/shopify/widget", handler: shopifyWidgetPatchHandler },
  { method: "GET", path: "/api/v1/team", handler: teamHandler },
  { method: "GET", path: "/api/v1/knowledge/jobs", handler: knowledgeJobsHandler },
  { method: "GET", path: "/api/v1/dashboard/stats", handler: dashboardStatsHandler },
  { method: "GET", path: "/api/v1/analytics", handler: analyticsHandler },
  { method: "GET", path: "/api/v1/social-content/daily", handler: socialContentDailyHandler },
  { method: "POST", path: "/api/v1/social-content/daily/generate", handler: socialContentDailyHandler },
  { method: "POST", path: "/api/v1/devices/register", handler: devicesHandler },
  { method: "DELETE", path: "/api/v1/devices/register", handler: devicesHandler },
  { method: "GET", path: "/api/v1/channels", handler: channelsListHandler },
  { method: "POST", path: "/api/v1/channels/meta/connect", handler: channelsConnectHandler },
  { method: "POST", path: "/api/v1/channels/meta/connect-messenger", handler: channelsConnectMessengerHandler },
  { method: "POST", path: "/api/v1/channels/meta/connect-instagram", handler: channelsConnectInstagramHandler },
  { method: "POST", path: "/api/v1/channels/meta/connect-dev", handler: channelsDevConnectHandler },
  { method: "POST", path: "/api/v1/channels/meta/connect-messenger-dev", handler: channelsMessengerDevConnectHandler },
  { method: "GET", path: "/api/v1/channels/meta/dev-status", handler: channelsDevStatusHandler },
  { method: "GET", path: "/api/v1/channels/meta/health", handler: channelsHealthHandler },
  { method: "POST", path: "/internal/cron/meta-token-refresh", handler: cronMetaTokenRefreshHandler },
  { method: "POST", path: "/internal/cron/billing-lifecycle", handler: cronBillingLifecycleHandler },
  { method: "POST", path: "/internal/cron/social-content-daily", handler: cronSocialContentDailyHandler },
];

const WIDGET_JS_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../widget/public/v1.js");
const WIDGET_DEMO_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../widget/demo.html");

const PATTERN_ROUTES: Array<{
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: LambdaHandler;
}> = [
  {
    method: "DELETE",
    pattern: /^\/api\/v1\/knowledge\/sources\/([^/]+)$/,
    paramNames: ["sourceId"],
    handler: knowledgeSourcesHandler,
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/knowledge\/sources\/([^/]+)\/sync$/,
    paramNames: ["sourceId"],
    handler: knowledgeSyncHandler,
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/knowledge\/jobs\/([^/]+)$/,
    paramNames: ["jobId"],
    handler: knowledgeJobsHandler,
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/knowledge\/jobs\/([^/]+)\/cancel$/,
    paramNames: ["jobId"],
    handler: knowledgeJobsHandler,
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/conversations\/([^/]+)\/messages$/,
    paramNames: ["conversationId"],
    handler: conversationsHandler,
  },
  {
    method: "PATCH",
    pattern: /^\/api\/v1\/conversations\/([^/]+)\/handling$/,
    paramNames: ["conversationId"],
    handler: conversationsHandler,
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/conversations\/([^/]+)\/reply$/,
    paramNames: ["conversationId"],
    handler: conversationsHandler,
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/conversations\/([^/]+)$/,
    paramNames: ["conversationId"],
    handler: conversationsHandler,
  },
  {
    method: "DELETE",
    pattern: /^\/api\/v1\/channels\/meta\/([^/]+)$/,
    paramNames: ["channel"],
    handler: channelsDisconnectHandler,
  },
  {
    method: "DELETE",
    pattern: /^\/api\/v1\/team\/([^/]+)$/,
    paramNames: ["userId"],
    handler: teamDeleteHandler,
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/platform\/tenants\/([^/]+)$/,
    paramNames: ["tenantId"],
    handler: platformTenantGetHandler,
  },
  {
    method: "PATCH",
    pattern: /^\/api\/v1\/platform\/tenants\/([^/]+)$/,
    paramNames: ["tenantId"],
    handler: platformTenantPatchHandler,
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/platform\/tenants\/([^/]+)\/ai-wallet\/topup$/,
    paramNames: ["tenantId"],
    handler: platformTenantAiWalletTopupHandler,
  },
  {
    method: "PATCH",
    pattern: /^\/api\/v1\/platform\/users\/([^/]+)$/,
    paramNames: ["email"],
    handler: platformUserPatchHandler,
  },
  {
    method: "PATCH",
    pattern: /^\/api\/v1\/team\/([^/]+)$/,
    paramNames: ["userId"],
    handler: teamPatchHandler,
  },
];

const emptyContext = {} as Context;

async function invokeLambda(
  handler: LambdaHandler,
  req: Request,
  pathParameters?: Record<string, string>
): Promise<Response> {
  const contentType = req.headers.get("content-type") ?? "";
  let body: string | undefined;
  let isBase64Encoded = false;

  if (req.method !== "GET" && req.method !== "HEAD") {
    if (contentType.includes("multipart/form-data")) {
      const buf = Buffer.from(await req.arrayBuffer());
      body = buf.toString("base64");
      isBase64Encoded = true;
    } else {
      body = await req.text();
    }
  }

  const event = toApigwEvent(req, body, pathParameters, isBase64Encoded);
  const result = await handler(event, emptyContext);
  const res = result as { statusCode: number; headers?: Record<string, string>; body?: string };
  return new Response(res.statusCode === 204 ? null : (res.body ?? ""), {
    status: res.statusCode,
    headers: res.headers,
  });
}

function findRoute(method: string, path: string) {
  const exact = REAL_ROUTES.find((r) => r.method === method && r.path === path);
  if (exact) return { handler: exact.handler, pathParameters: undefined };

  for (const route of PATTERN_ROUTES) {
    if (route.method !== method) continue;
    const params = matchPathParams(path, route.pattern, route.paramNames);
    if (params) return { handler: route.handler, pathParameters: params };
  }
  return null;
}

function hasRealRoute(path: string) {
  if (REAL_ROUTES.some((r) => r.path === path)) return true;
  for (const route of PATTERN_ROUTES) {
    if (matchPathParams(path, route.pattern, route.paramNames)) return true;
  }
  return false;
}

export function createLocalApp() {
  const app = new Hono();
  const mockApp = createMockServerApp();

  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Requested-With"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    })
  );

  app.get("/widget/demo.html", (c) => {
    if (!existsSync(WIDGET_DEMO_PATH)) {
      return c.text("Demo page not found", 404);
    }
    const html = readFileSync(WIDGET_DEMO_PATH, "utf8");
    return c.html(html);
  });

  app.get("/assets/logos/:filename", (c) => {
    const filename = c.req.param("filename");
    if (!filename || filename.includes("..")) {
      return c.text("Not found", 404);
    }
    const dataDir = process.env.DATA_DIR ?? ".data";
    const path = join(dataDir, "assets", "logos", filename);
    if (!existsSync(path)) {
      return c.text("Not found", 404);
    }
    const ext = extname(filename).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";
    const buf = readFileSync(path);
    return c.body(buf, 200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    });
  });

  app.get("/widget/v1.js", (c) => {
    if (!existsSync(WIDGET_JS_PATH)) {
      return c.text("Widget bundle not found", 404);
    }
    const js = readFileSync(WIDGET_JS_PATH, "utf8");
    return c.body(js, 200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    });
  });

  app.post("/api/v1/widget/chat/stream", async (c) => {
    const config = loadConfig();
    const apiKey = c.req.header("x-api-key");
    if (!apiKey) {
      return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing X-API-Key header" } }, 401);
    }

    const body = await c.req.json<{
      sessionId?: string;
      message?: string;
      metadata?: Record<string, unknown>;
    }>();
    const sessionId = body.sessionId?.trim();
    const message = body.message?.trim();
    if (!sessionId || !message) {
      return c.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "sessionId and message are required" } },
        400
      );
    }

    const tenantId = await verifyWidgetApiKey(apiKey, config);
    await assertWidgetChatRateLimit(tenantId, sessionId, config);
    await assertTenantOperational(tenantId, config);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(encodeSseEvent(event, data)));
        };

        try {
          send("start", { sessionId });
          send("typing", { active: true });
          let streamedToken = false;
          const result = await runChatOrchestrator(
            { tenantId, userId: "widget", role: "viewer", email: "" },
            {
              channel: "web",
              externalUserId: sessionId,
              message,
              metadata: body.metadata,
            },
            config,
            {
              onToken: (text) => {
                streamedToken = true;
                send("token", { text });
              },
            }
          );
          const payload = await buildWidgetChatPayload(tenantId, { sessionId, message, metadata: body.metadata }, result, config);
          if (!streamedToken) {
            const chunks = payload.reply.content.match(/.{1,24}(?:\s|$)|\S+/g) ?? [payload.reply.content];
            for (const chunk of chunks) send("token", { text: chunk });
          }
          for (const card of payload.productCards) send("product_card", card);
          send("done", {
            sessionId: payload.sessionId,
            conversationId: payload.conversationId,
            reply: payload.reply,
            intent: payload.intent,
            subIntent: payload.subIntent,
            funnelStage: payload.funnelStage,
            suggestedActions: payload.suggestedActions,
            suggestedQuestions: payload.suggestedQuestions,
            productCards: payload.productCards,
          });
        } catch (err) {
          send("error", {
            message: err instanceof Error ? err.message : "Chat stream failed",
          });
        } finally {
          send("typing", { active: false });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  });

  app.all("*", async (c) => {
    if (c.req.method === "OPTIONS" && hasRealRoute(c.req.path)) {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    const match = findRoute(c.req.method, c.req.path);
    if (match) {
      return invokeLambda(match.handler, c.req.raw, match.pathParameters);
    }
    return mockApp.fetch(c.req.raw);
  });

  return app;
}

const port = Number(process.env.PORT ?? 3001);
const app = createLocalApp();

console.log(`CommerceChat Lambda API (local) → http://localhost:${port}`);
console.log(`  Real handlers: auth, tenant, team, knowledge, commerce, chat, conversations, widget, dashboard, webhooks, health`);
const publicUrl = process.env.API_PUBLIC_URL ?? "http://localhost:3001";
console.log(`  Widget bundle:   ${publicUrl}/widget/v1.js`);
console.log(`  Widget demo:       ${publicUrl}/widget/demo.html`);
console.log(`  Mock fallback:   all other routes`);

serve({ fetch: app.fetch, port });

const tokenRefreshIntervalMs = Number(process.env.META_TOKEN_REFRESH_INTERVAL_MS ?? 0);
if (tokenRefreshIntervalMs > 0) {
  const cronConfig = loadConfig();
  const runRefresh = () => {
    void import("@commercechat/core")
      .then(({ refreshExpiringMetaTokens }) => refreshExpiringMetaTokens(cronConfig))
      .then((result) => {
        console.log(
          "[cron-meta-token-refresh:interval]",
          `scanned=${result.scanned}`,
          `refreshed=${result.refreshed}`,
          `failed=${result.failed}`
        );
      })
      .catch((err) => {
        console.error(
          "[cron-meta-token-refresh:interval]",
          err instanceof Error ? err.message : err
        );
      });
  };
  runRefresh();
  setInterval(runRefresh, tokenRefreshIntervalMs);
  console.log(`  Meta token refresh interval: every ${tokenRefreshIntervalMs}ms`);
}
