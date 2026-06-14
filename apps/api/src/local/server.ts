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
import { handler as commerceProductsHandler } from "../handlers/commerce-products";
import {
  connectHandler as wordpressConnectHandler,
  disconnectHandler as wordpressDisconnectHandler,
  statusHandler as wordpressStatusHandler,
  syncHandler as wordpressSyncHandler,
  widgetBootstrapHandler as wordpressWidgetBootstrapHandler,
} from "../handlers/commerce-wordpress";
import { handler as teamHandler } from "../handlers/team";
import { deleteHandler as teamDeleteHandler, patchHandler as teamPatchHandler } from "../handlers/team-member";
import { presignHandler as logoPresignHandler, completeHandler as logoCompleteHandler } from "../handlers/tenant-logo-presign";
import { handler as chatApiHandler } from "../handlers/chat-api";
import { handler as tenantUsageHandler } from "../handlers/tenant-usage";
import { handler as tenantWidgetKeyHandler } from "../handlers/tenant-widget-key";
import { handler as conversationsHandler } from "../handlers/conversations";
import { configHandler as widgetConfigHandler, chatHandler as widgetChatHandler, streamHandler as widgetStreamHandler } from "../handlers/widget";
import { handler as dashboardStatsHandler } from "../handlers/dashboard-stats";
import { handler as webhookMetaHandler } from "../handlers/webhook-meta";
import { handler as cronMetaTokenRefreshHandler } from "../handlers/cron-meta-token-refresh";
import { loadConfig } from "@commercechat/core";
import { handler as webhookPaymentHandler } from "../handlers/webhook-payment";
import {
  plansHandler as billingPlansHandler,
  subscriptionHandler as billingSubscriptionHandler,
  overviewHandler as billingOverviewHandler,
  checkoutHandler as billingCheckoutHandler,
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
  { method: "GET", path: "/api/v1/billing/plans", handler: billingPlansHandler },
  { method: "GET", path: "/api/v1/billing/subscription", handler: billingSubscriptionHandler },
  { method: "GET", path: "/api/v1/billing/overview", handler: billingOverviewHandler },
  { method: "POST", path: "/api/v1/billing/checkout", handler: billingCheckoutHandler },
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
  { method: "GET", path: "/api/v1/conversations", handler: conversationsHandler },
  { method: "GET", path: "/api/v1/widget/config", handler: widgetConfigHandler },
  { method: "POST", path: "/api/v1/widget/chat", handler: widgetChatHandler },
  { method: "POST", path: "/api/v1/widget/chat/stream", handler: widgetStreamHandler },
  { method: "POST", path: "/api/v1/chat", handler: chatApiHandler },
  { method: "GET", path: "/api/v1/onboarding", handler: onboardingHandler },
  { method: "PATCH", path: "/api/v1/onboarding/step", handler: onboardingHandler },
  { method: "POST", path: "/api/v1/onboarding/test-chat", handler: onboardingTestChatHandler },
  { method: "GET", path: "/api/v1/knowledge/sources", handler: knowledgeSourcesHandler },
  { method: "POST", path: "/api/v1/knowledge/sources", handler: knowledgeSourcesHandler },
  { method: "GET", path: "/api/v1/knowledge/faq", handler: knowledgeFaqHandler },
  { method: "POST", path: "/api/v1/knowledge/faq", handler: knowledgeFaqHandler },
  { method: "GET", path: "/api/v1/knowledge/page-voice", handler: knowledgePageVoiceHandler },
  { method: "PATCH", path: "/api/v1/knowledge/page-voice", handler: knowledgePageVoiceHandler },
  { method: "POST", path: "/api/v1/knowledge/page-voice/sync", handler: knowledgePageVoiceHandler },
  { method: "POST", path: "/api/v1/knowledge/page-voice/upload", handler: knowledgePageVoiceHandler },
  { method: "POST", path: "/api/v1/knowledge/detect-platform", handler: knowledgeDetectPlatformHandler },
  { method: "GET", path: "/api/v1/commerce/products", handler: commerceProductsHandler },
  { method: "GET", path: "/api/v1/commerce/wordpress/status", handler: wordpressStatusHandler },
  { method: "POST", path: "/api/v1/commerce/wordpress/connect", handler: wordpressConnectHandler },
  { method: "POST", path: "/api/v1/commerce/wordpress/sync", handler: wordpressSyncHandler },
  { method: "DELETE", path: "/api/v1/commerce/wordpress", handler: wordpressDisconnectHandler },
  { method: "GET", path: "/api/v1/commerce/wordpress/widget-bootstrap", handler: wordpressWidgetBootstrapHandler },
  { method: "GET", path: "/api/v1/team", handler: teamHandler },
  { method: "GET", path: "/api/v1/knowledge/jobs", handler: knowledgeJobsHandler },
  { method: "GET", path: "/api/v1/dashboard/stats", handler: dashboardStatsHandler },
  { method: "GET", path: "/api/v1/channels", handler: channelsListHandler },
  { method: "POST", path: "/api/v1/channels/meta/connect", handler: channelsConnectHandler },
  { method: "POST", path: "/api/v1/channels/meta/connect-messenger", handler: channelsConnectMessengerHandler },
  { method: "POST", path: "/api/v1/channels/meta/connect-instagram", handler: channelsConnectInstagramHandler },
  { method: "POST", path: "/api/v1/channels/meta/connect-dev", handler: channelsDevConnectHandler },
  { method: "POST", path: "/api/v1/channels/meta/connect-messenger-dev", handler: channelsMessengerDevConnectHandler },
  { method: "GET", path: "/api/v1/channels/meta/dev-status", handler: channelsDevStatusHandler },
  { method: "GET", path: "/api/v1/channels/meta/health", handler: channelsHealthHandler },
  { method: "POST", path: "/internal/cron/meta-token-refresh", handler: cronMetaTokenRefreshHandler },
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
    method: "GET",
    pattern: /^\/api\/v1\/conversations\/([^/]+)\/messages$/,
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
