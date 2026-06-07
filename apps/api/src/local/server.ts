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
];

const emptyContext = {} as Context;

async function invokeLambda(handler: LambdaHandler, req: Request): Promise<Response> {
  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();
  const event = toApigwEvent(req, body || undefined);
  const result = await handler(event, emptyContext);
  const res = result as { statusCode: number; headers?: Record<string, string>; body?: string };
  return new Response(res.body ?? "", {
    status: res.statusCode,
    headers: res.headers,
  });
}

export function createLocalApp() {
  const app = new Hono();
  const mockApp = createMockServerApp();

  app.all("*", async (c) => {
    const match = REAL_ROUTES.find(
      (r) => r.method === c.req.method && r.path === c.req.path
    );
    if (match) {
      return invokeLambda(match.handler, c.req.raw);
    }
    // Unimplemented routes → mock API (temporary until more Lambdas ship)
    return mockApp.fetch(c.req.raw);
  });

  return app;
}

const port = Number(process.env.PORT ?? 3001);
const app = createLocalApp();

console.log(`CommerceChat Lambda API (local) → http://localhost:${port}`);
console.log(`  Real handlers: auth, tenant, health`);
console.log(`  Mock fallback:   all other routes`);

serve({ fetch: app.fetch, port });
