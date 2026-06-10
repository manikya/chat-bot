import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  DEMO_CHANNELS,
  DEMO_CONFIG,
  DEMO_CONVERSATION_DETAILS,
  DEMO_CONVERSATIONS,
  DEMO_DASHBOARD,
  DEMO_JOBS,
  DEMO_LIMITS,
  DEMO_LOGIN,
  DEMO_MESSAGES,
  DEMO_SOURCES,
  DEMO_TEAM,
  DEMO_USAGE,
  MOCK_TEST_REPLIES,
  NEW_USER_TENANT,
  WIDGET_EMBED,
} from "../fixtures";
import type { ApiResponse, ChannelInfo, IngestJob, KnowledgeSource, OnboardingStep } from "../types";
import { defaultSession, store } from "./store";

function ok<T>(data: T, message?: string): ApiResponse<T> {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

function err(code: string, message: string, status = 400) {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code, message },
      timestamp: new Date().toISOString(),
    }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

function json<T>(data: ApiResponse<T>, status = 200) {
  return Response.json(data, { status });
}

function getToken(c: { req: { header: (n: string) => string | undefined } }) {
  const auth = c.req.header("Authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createMockServerApp() {
  const app = new Hono();

  app.use("*", cors({ origin: ["http://localhost:3000", "http://127.0.0.1:3000"], credentials: true }));

  app.get("/health", (c) => json(ok({ status: "ok", version: "mock-1.0.0" })));

  app.post("/auth/signup", async (c) => {
    await delay(300);
    const body = await c.req.json();
    const session = defaultSession({
      user: {
        userId: "usr_new001",
        tenantId: "ten_new001",
        email: body.email,
        name: body.name,
        role: "owner",
        emailVerified: false,
        mfaEnabled: false,
      },
      tenant: { ...NEW_USER_TENANT, storeName: body.storeName, timezone: body.timezone },
    });
    store.saveByEmail(body.email, session);
    return json(
      ok({
        tenantId: session.tenant.tenantId,
        userId: session.user.userId,
        email: body.email,
        emailVerified: false,
        onboardingStep: "profile" as OnboardingStep,
      }, "Account created. Please verify your email."),
      201
    );
  });

  app.post("/auth/login", async (c) => {
    await delay(300);
    const { email, password: _password } = await c.req.json();
    const existing = store.getByEmail(email);
    if (existing) {
      if (!existing.user.emailVerified) {
        return err("EMAIL_NOT_VERIFIED", "Please verify your email first.", 403);
      }
      const token = store.issueToken(existing);
      return json(
        ok({
          accessToken: token,
          refreshToken: `mock_refresh_${Date.now()}`,
          expiresIn: 3600,
          tokenType: "Bearer",
          user: existing.user,
          tenant: existing.tenant,
        })
      );
    }
    if (email === "owner@store.com" || email === "demo@commercechat.com") {
      const session = defaultSession();
      const token = store.issueToken(session);
      return json(ok({ ...DEMO_LOGIN, accessToken: token }));
    }
    return err("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  });

  app.get("/auth/me", async (c) => {
    await delay(100);
    const session = store.resolve(getToken(c));
    return json(ok({ user: session.user, tenant: session.tenant }));
  });

  app.post("/auth/verify-email", async (c) => {
    await delay(200);
    const session = store.resolve(getToken(c));
    session.user.emailVerified = true;
    store.saveByEmail(session.user.email, session);
    return json(ok({ emailVerified: true }));
  });

  app.post("/auth/resend-verification", async () => {
    await delay(150);
    return json(ok({ sent: true }));
  });

  app.post("/auth/forgot-password", async () => {
    await delay(150);
    return json(ok({ sent: true }, "If that email exists, a reset link has been sent."));
  });

  app.post("/auth/logout", async (c) => {
    const token = getToken(c);
    if (token) store.revokeToken(token);
    return json(ok({ loggedOut: true }));
  });

  app.get("/api/v1/tenants/me", async (c) => json(ok(store.resolve(getToken(c)).tenant)));
  app.patch("/api/v1/tenants/me", async (c) => {
    const patch = await c.req.json();
    const session = store.resolve(getToken(c));
    session.tenant = { ...session.tenant, ...patch };
    return json(ok(session.tenant));
  });

  app.get("/api/v1/tenants/me/config", async (c) => json(ok(store.resolve(getToken(c)).config)));
  app.patch("/api/v1/tenants/me/config", async (c) => {
    const patch = await c.req.json();
    const session = store.resolve(getToken(c));
    session.config = {
      ...session.config,
      ...patch,
      prompts: { ...session.config.prompts, ...patch.prompts },
      widgetConfig: { ...session.config.widgetConfig, ...patch.widgetConfig },
    };
    return json(ok(session.config));
  });

  app.get("/api/v1/tenants/me/limits", async () => json(ok(DEMO_LIMITS)));
  app.get("/api/v1/tenants/me/usage", async () => json(ok(DEMO_USAGE)));
  app.post("/api/v1/tenants/me/widget/regenerate-key", async () =>
    json(
      ok({
        apiKey: "pk_live_" + Math.random().toString(36).slice(2, 14),
        prefix: "pk_live_abc",
        createdAt: new Date().toISOString(),
      })
    )
  );

  app.get("/api/v1/onboarding", async (c) => json(ok(store.resolve(getToken(c)).onboarding)));
  app.patch("/api/v1/onboarding/step", async (c) => {
    const { step, skipped: _skipped } = await c.req.json();
    const session = store.resolve(getToken(c));
    session.tenant.onboardingStep = step;
    session.onboarding.currentStep = step;
    const stepOrder = ["profile", "channels", "knowledge", "catalog", "test", "widget", "complete"];
    const curIdx = stepOrder.indexOf(step);
    session.onboarding.steps = session.onboarding.steps.map((s) => {
      if (s.step === step) return { ...s, status: "in_progress" as const };
      const sIdx = stepOrder.indexOf(s.step);
      if (sIdx < curIdx) return { ...s, status: "completed" as const, completedAt: new Date().toISOString() };
      return s;
    });
    if (step === "complete") {
      session.onboarding.steps.forEach((s) => {
        if (s.status !== "completed") s.status = "completed";
      });
    }
    return json(ok({ previousStep: step, currentStep: step, onboardingStep: step }));
  });

  app.post("/api/v1/onboarding/test-chat", async (c) => {
    const { message } = await c.req.json();
    const session = store.resolve(getToken(c));
    session.testMessageCount += 1;
    const reply = MOCK_TEST_REPLIES[session.testMessageCount % MOCK_TEST_REPLIES.length];
    return json(
      ok({
        reply: { type: "text", content: reply },
        testMessageCount: session.testMessageCount,
        canAdvanceToWidget: session.testMessageCount >= 1,
        echo: message,
      })
    );
  });

  app.get("/api/v1/channels", async () => json(ok({ channels: DEMO_CHANNELS })));
  app.post("/api/v1/channels/meta/connect", async () => {
    await delay(800);
    return json(
      ok({
        connected: ["whatsapp"],
        whatsapp: { phoneNumberId: "444555666", displayPhone: "+1 555 123 4567" },
        messenger: { status: "not_linked" },
        instagram: { status: "not_linked" },
      })
    );
  });
  app.delete("/api/v1/channels/meta/:channel", async (c) =>
    json(ok({ channel: c.req.param("channel"), status: "disconnected" }))
  );
  app.get("/api/v1/channels/meta/health", async () =>
    json(ok({
      whatsapp: { status: "healthy", lastCheck: new Date().toISOString() },
      messenger: { status: "disconnected" },
    }))
  );

  app.get("/api/v1/conversations", async (c) => {
    const channel = c.req.query("channel");
    let items = [...DEMO_CONVERSATIONS];
    if (channel && channel !== "all") items = items.filter((x) => x.channel === channel);
    return json(ok({ items, nextCursor: null, hasMore: false }));
  });
  app.get("/api/v1/conversations/:id", async (c) => {
    const id = c.req.param("id");
    const detail = DEMO_CONVERSATION_DETAILS[id] ?? DEMO_CONVERSATIONS.find((x) => x.conversationId === id);
    return json(ok(detail));
  });
  app.get("/api/v1/conversations/:id/messages", async (c) =>
    json(ok({ items: DEMO_MESSAGES[c.req.param("id")] ?? [], nextCursor: null, hasMore: false }))
  );

  app.get("/api/v1/knowledge/sources", async () => json(ok({ items: DEMO_SOURCES })));
  app.post("/api/v1/knowledge/sources", async (c) => {
    const body = await c.req.json();
    const source: KnowledgeSource = {
      sourceId: "src_" + Math.random().toString(36).slice(2, 8),
      type: body.type,
      name: body.name,
      status: "active",
      chunkCount: 0,
      vectorCount: 0,
    };
    return json(ok(source), 201);
  });
  app.post("/api/v1/knowledge/sources/:id/sync", async (c) => {
    const job: IngestJob = {
      jobId: "job_" + Math.random().toString(36).slice(2, 8),
      sourceId: c.req.param("id"),
      type: "website_sync",
      status: "queued",
    };
    return json(ok(job), 202);
  });
  app.get("/api/v1/knowledge/jobs", async () => json(ok({ items: DEMO_JOBS, nextCursor: null, hasMore: false })));
  app.delete("/api/v1/knowledge/sources/:id", async (c) =>
    json(ok({ sourceId: c.req.param("id"), deleted: true }), 202)
  );

  app.get("/api/v1/team", async () => json(ok({ items: DEMO_TEAM })));
  app.post("/auth/invite", async (c) => {
    const body = await c.req.json();
    return json(
      ok({
        inviteId: "inv_" + Math.random().toString(36).slice(2, 8),
        email: body.email,
        role: body.role,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      }),
      201
    );
  });
  app.post("/auth/accept-invite", async (c) => {
    const body = await c.req.json();
    const session = store.resolve(getToken(c));
    return json(
      ok({
        accessToken: "mock_access_invite",
        refreshToken: "mock_refresh_invite",
        expiresIn: 3600,
        tokenType: "Bearer",
        user: {
          ...session.user,
          userId: "usr_invited",
          email: body.email ?? "invited@example.com",
          name: body.name ?? "Invited User",
          role: "viewer",
          emailVerified: true,
        },
        tenant: session.tenant,
      })
    );
  });

  app.get("/api/v1/dashboard/stats", async () => json(ok(DEMO_DASHBOARD)));

  app.get("/api/v1/widget/config", async (c) => {
    const session = store.resolve(getToken(c));
    return json(
      ok({
        storeName: session.tenant.storeName,
        greeting: session.config.prompts.greeting,
        primaryColor: session.config.widgetConfig.primaryColor,
        position: session.config.widgetConfig.position,
        suggestedQuestions: session.config.widgetConfig.suggestedQuestions,
        enabled: true,
        embedCode: WIDGET_EMBED,
      })
    );
  });

  app.post("/api/v1/chat", async (c) => {
    const { message } = await c.req.json();
    const reply = MOCK_TEST_REPLIES[Math.floor(Math.random() * MOCK_TEST_REPLIES.length)];
    return json(
      ok({
        reply: { type: "text", content: reply },
        toolResults: [{ tool: "search_products", success: true }],
        echo: message,
      })
    );
  });

  return app;
}
