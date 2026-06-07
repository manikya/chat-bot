import { serve } from "@hono/node-server";
import { Hono } from "hono";
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
import { handler as tenantMeHandler } from "../handlers/tenant-me";
import { handler as tenantConfigHandler } from "../handlers/tenant-config";
import { handler as tenantLimitsHandler } from "../handlers/tenant-limits";
import { handler as onboardingHandler } from "../handlers/onboarding";
import { handler as onboardingTestChatHandler } from "../handlers/onboarding-test-chat";
import { handler as knowledgeSourcesHandler } from "../handlers/knowledge-sources";
import { handler as knowledgeSyncHandler } from "../handlers/knowledge-sync";
import { handler as knowledgeJobsHandler } from "../handlers/knowledge-jobs";
import { handler as chatApiHandler } from "../handlers/chat-api";
import { matchPathParams } from "../lib/apigw";
import { toApigwEvent } from "./event";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";

type LambdaHandler = (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyResultV2>;

const REAL_ROUTES: Array<{
  method: string;
  path: string;
  handler: LambdaHandler;
}> = [
  { method: "GET", path: "/health", handler: healthHandler },
  { method: "POST", path: "/auth/signup", handler: signupHandler },
  { method: "POST", path: "/auth/login", handler: loginHandler },
  { method: "GET", path: "/auth/me", handler: meHandler },
  { method: "POST", path: "/auth/verify-email", handler: verifyHandler },
  { method: "POST", path: "/auth/refresh", handler: refreshHandler },
  { method: "POST", path: "/auth/logout", handler: logoutHandler },
  { method: "POST", path: "/auth/forgot-password", handler: forgotPasswordHandler },
  { method: "POST", path: "/auth/reset-password", handler: resetPasswordHandler },
  { method: "POST", path: "/auth/resend-verification", handler: resendVerificationHandler },
  { method: "GET", path: "/api/v1/tenants/me", handler: tenantMeHandler },
  { method: "PATCH", path: "/api/v1/tenants/me", handler: tenantMeHandler },
  { method: "GET", path: "/api/v1/tenants/me/config", handler: tenantConfigHandler },
  { method: "PATCH", path: "/api/v1/tenants/me/config", handler: tenantConfigHandler },
  { method: "GET", path: "/api/v1/tenants/me/limits", handler: tenantLimitsHandler },
  { method: "GET", path: "/api/v1/onboarding", handler: onboardingHandler },
  { method: "PATCH", path: "/api/v1/onboarding/step", handler: onboardingHandler },
  { method: "POST", path: "/api/v1/onboarding/test-chat", handler: onboardingTestChatHandler },
  { method: "GET", path: "/api/v1/knowledge/sources", handler: knowledgeSourcesHandler },
  { method: "POST", path: "/api/v1/knowledge/sources", handler: knowledgeSourcesHandler },
  { method: "GET", path: "/api/v1/knowledge/jobs", handler: knowledgeJobsHandler },
  { method: "POST", path: "/api/v1/chat", handler: chatApiHandler },
];

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
  return new Response(res.body ?? "", {
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

export function createLocalApp() {
  const app = new Hono();
  const mockApp = createMockServerApp();

  app.all("*", async (c) => {
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
console.log(`  Real handlers: auth, tenant, onboarding, knowledge, health`);
console.log(`  Mock fallback:   all other routes`);

serve({ fetch: app.fetch, port });
