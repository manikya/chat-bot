import {
  DEMO_CHANNELS,
  DEMO_CONFIG,
  DEMO_CONVERSATION_DETAILS,
  DEMO_CONVERSATIONS,
  DEMO_DASHBOARD,
  DEMO_ANALYTICS,
  DEMO_JOBS,
  DEMO_LIMITS,
  DEMO_LOGIN,
  DEMO_MESSAGES,
  DEMO_ONBOARDING,
  DEMO_SOURCES,
  DEMO_TEAM,
  DEMO_TENANT,
  DEMO_USAGE,
  DEMO_USER,
  MOCK_TEST_REPLIES,
  NEW_USER_TENANT,
  WIDGET_EMBED,
} from "./fixtures";
import type {
  ApiResponse,
  ChannelInfo,
  Conversation,
  ConversationDetail,
  ConversationAnalytics,
  DashboardStats,
  IngestJob,
  KnowledgeSource,
  LoginResult,
  Message,
  OnboardingState,
  OnboardingStep,
  PlanLimits,
  TeamMember,
  Tenant,
  TenantConfig,
  Usage,
  User,
} from "./types";

const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

function ok<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

const STORAGE_KEY = "cc_mock_session";

interface MockSession {
  user: User;
  tenant: Tenant;
  config: TenantConfig;
  onboarding: OnboardingState;
  testMessageCount: number;
}

function loadSession(): MockSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MockSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: MockSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function defaultSession(overrides?: Partial<MockSession>): MockSession {
  return {
    user: { ...DEMO_USER },
    tenant: { ...DEMO_TENANT },
    config: { ...DEMO_CONFIG },
    onboarding: structuredClone(DEMO_ONBOARDING),
    testMessageCount: 0,
    ...overrides,
  };
}

export function createMockApi() {
  return {
    auth: {
      async signup(body: {
        storeName: string;
        email: string;
        password: string;
        name: string;
        timezone: string;
      }) {
        await delay(600);
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
          tenant: {
            ...NEW_USER_TENANT,
            storeName: body.storeName,
            timezone: body.timezone,
          },
        });
        saveSession(session);
        return ok({
          tenantId: session.tenant.tenantId,
          userId: session.user.userId,
          email: body.email,
          emailVerified: false,
          onboardingStep: "profile" as OnboardingStep,
        }, "Account created. Please verify your email.");
      },

      async login(email: string, _password: string) {
        await delay(500);
        const existing = loadSession();
        if (existing && existing.user.email === email) {
          if (!existing.user.emailVerified) {
            throw { code: "EMAIL_NOT_VERIFIED", message: "Please verify your email first." };
          }
          return ok<LoginResult>({
            accessToken: "mock_access_" + Date.now(),
            refreshToken: "mock_refresh_" + Date.now(),
            expiresIn: 3600,
            tokenType: "Bearer",
            user: existing.user,
            tenant: existing.tenant,
          });
        }
        if (email === "owner@store.com" || email === "demo@commercechat.com") {
          const session = defaultSession();
          saveSession(session);
          return ok(DEMO_LOGIN);
        }
        throw { code: "INVALID_CREDENTIALS", message: "Invalid email or password." };
      },

      async me() {
        await delay(200);
        const session = loadSession() ?? defaultSession();
        return ok({ user: session.user, tenant: session.tenant });
      },

      async refresh() {
        await delay(200);
        return ok({
          accessToken: "mock_access_" + Date.now(),
          expiresIn: 3600,
          tokenType: "Bearer",
        });
      },

      async verifyEmail(_token?: string) {
        await delay(400);
        const session = loadSession() ?? defaultSession();
        session.user.emailVerified = true;
        saveSession(session);
        return ok({ emailVerified: true });
      },

      async resendVerification(_email?: string) {
        await delay(300);
        return ok({ sent: true }, "If that email is unverified, a new link has been sent.");
      },

      async forgotPassword(_email?: string) {
        await delay(300);
        return ok({ sent: true }, "If that email exists, a reset link has been sent.");
      },

      async resetPassword(_token?: string, _password?: string) {
        await delay(300);
        return ok({ reset: true }, "Password updated successfully.");
      },

      async acceptInvite(body: { token: string; password: string; name?: string }) {
        await delay(400);
        const invited = defaultSession({
          user: {
            userId: "usr_invited",
            tenantId: DEMO_TENANT.tenantId,
            email: "invited@example.com",
            name: body.name ?? "Invited User",
            role: "viewer",
            emailVerified: true,
            mfaEnabled: false,
          },
        });
        saveSession(invited);
        return ok<LoginResult>({
          accessToken: "mock_access_" + Date.now(),
          refreshToken: "mock_refresh_" + Date.now(),
          expiresIn: 3600,
          tokenType: "Bearer",
          user: invited.user,
          tenant: invited.tenant,
        });
      },

      async logout() {
        await delay(200);
        if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
        return ok({ loggedOut: true });
      },
    },

    tenant: {
      async getMe() {
        await delay(200);
        const session = loadSession() ?? defaultSession();
        return ok(session.tenant);
      },

      async updateMe(patch: Partial<Tenant>) {
        await delay(300);
        const session = loadSession() ?? defaultSession();
        session.tenant = { ...session.tenant, ...patch };
        saveSession(session);
        return ok(session.tenant);
      },

      async getConfig() {
        await delay(200);
        const session = loadSession() ?? defaultSession();
        return ok(session.config);
      },

      async updateConfig(patch: Partial<TenantConfig>) {
        await delay(300);
        const session = loadSession() ?? defaultSession();
        session.config = {
          ...session.config,
          ...patch,
          prompts: { ...session.config.prompts, ...patch.prompts },
          widgetConfig: { ...session.config.widgetConfig, ...patch.widgetConfig },
          featureFlags: { ...session.config.featureFlags, ...patch.featureFlags },
        };
        saveSession(session);
        return ok(session.config);
      },

      async getLimits() {
        await delay(200);
        return ok(DEMO_LIMITS);
      },

      async getUsage() {
        await delay(300);
        return ok(DEMO_USAGE);
      },

      async regenerateWidgetKey() {
        await delay(400);
        return ok({
          apiKey: "pk_live_" + Math.random().toString(36).slice(2, 14),
          prefix: "pk_live_abc",
          createdAt: new Date().toISOString(),
        });
      },
    },

    onboarding: {
      async getState() {
        await delay(300);
        const session = loadSession() ?? defaultSession();
        return ok(session.onboarding);
      },

      async advanceStep(step: OnboardingStep, skipped = false) {
        await delay(300);
        const session = loadSession() ?? defaultSession();
        session.tenant.onboardingStep = step;
        session.onboarding.currentStep = step;
        session.onboarding.steps = session.onboarding.steps.map((s) => {
          if (s.step === step) return { ...s, status: "in_progress" as const };
          const stepOrder = ["profile", "channels", "knowledge", "catalog", "test", "widget", "complete"];
          const curIdx = stepOrder.indexOf(step);
          const sIdx = stepOrder.indexOf(s.step);
          if (sIdx < curIdx) return { ...s, status: "completed" as const, completedAt: new Date().toISOString() };
          return s;
        });
        if (skipped) {
          /* no-op marker for skip */
        }
        if (step === "complete") {
          session.onboarding.steps.forEach((s) => {
            if (s.status !== "completed") s.status = "completed";
          });
        }
        saveSession(session);
        return ok({
          previousStep: session.onboarding.currentStep,
          currentStep: step,
          onboardingStep: step,
        });
      },

      async testChat(message: string) {
        await delay(800);
        const session = loadSession() ?? defaultSession();
        session.testMessageCount += 1;
        saveSession(session);
        const reply =
          MOCK_TEST_REPLIES[session.testMessageCount % MOCK_TEST_REPLIES.length];
        return ok({
          reply: { type: "text", content: reply },
          testMessageCount: session.testMessageCount,
          canAdvanceToWidget: session.testMessageCount >= 1,
          echo: message,
        });
      },
    },

    channels: {
      async list() {
        await delay(300);
        return ok({ channels: DEMO_CHANNELS });
      },

      async connectMeta() {
        await delay(1200);
        const connected: ChannelInfo[] = DEMO_CHANNELS.map((c) =>
          c.channel === "whatsapp"
            ? { ...c, status: "connected" as const, displayPhone: "+1 555 123 4567", connectedAt: new Date().toISOString() }
            : c
        );
        return ok({
          connected: ["whatsapp"],
          whatsapp: { phoneNumberId: "444555666", displayPhone: "+1 555 123 4567" },
          messenger: { status: "not_linked" },
          instagram: { status: "not_linked" },
          channels: connected,
        });
      },

      async disconnect(channel: string) {
        await delay(400);
        return ok({ channel, status: "disconnected" });
      },

      async health() {
        await delay(200);
        return ok({
          whatsapp: { status: "healthy", lastCheck: new Date().toISOString() },
          messenger: { status: "disconnected" },
        });
      },
    },

    conversations: {
      async list(params?: { channel?: string }) {
        await delay(400);
        let items = [...DEMO_CONVERSATIONS];
        if (params?.channel && params.channel !== "all") {
          items = items.filter((c) => c.channel === params.channel);
        }
        return ok({ items, nextCursor: null, hasMore: false });
      },

      async get(id: string) {
        await delay(300);
        const detail = DEMO_CONVERSATION_DETAILS[id] ?? {
          ...DEMO_CONVERSATIONS.find((c) => c.conversationId === id)!,
        };
        return ok(detail);
      },

      async getMessages(id: string) {
        await delay(400);
        const items = DEMO_MESSAGES[id] ?? [];
        return ok({ items, nextCursor: null, hasMore: false });
      },
    },

    knowledge: {
      async listSources() {
        await delay(300);
        return ok({ items: DEMO_SOURCES });
      },

      async createSource(body: { type: string; name: string; config?: Record<string, unknown> }) {
        await delay(500);
        const source: KnowledgeSource = {
          sourceId: "src_" + Math.random().toString(36).slice(2, 8),
          type: body.type,
          name: body.name,
          status: "active",
          chunkCount: 0,
          vectorCount: 0,
        };
        return ok(source);
      },

      async createCatalogSource(file: File, name = "Product catalog") {
        await delay(500);
        const source: KnowledgeSource = {
          sourceId: "src_" + Math.random().toString(36).slice(2, 8),
          type: "catalog",
          name,
          status: "active",
          chunkCount: 0,
          vectorCount: 0,
        };
        void file;
        return ok(source);
      },

      async syncSource(sourceId: string) {
        await delay(600);
        const job: IngestJob = {
          jobId: "job_" + Math.random().toString(36).slice(2, 8),
          sourceId,
          type: "website_sync",
          status: "queued",
        };
        return ok(job);
      },

      async listJobs() {
        await delay(300);
        return ok({ items: DEMO_JOBS, nextCursor: null, hasMore: false });
      },

      async getJob(jobId: string) {
        await delay(200);
        const job = DEMO_JOBS.find((j) => j.jobId === jobId) ?? DEMO_JOBS[0]!;
        void jobId;
        return ok(job);
      },

      async deleteSource(sourceId: string) {
        await delay(400);
        return ok({ sourceId, deleted: true });
      },
    },

    team: {
      async list() {
        await delay(300);
        return ok({ items: DEMO_TEAM });
      },

      async invite(body: { email: string; role: string; name: string }) {
        await delay(500);
        return ok({
          inviteId: "inv_" + Math.random().toString(36).slice(2, 8),
          email: body.email,
          role: body.role,
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        });
      },

      async remove(_userId: string) {
        await delay(300);
        return { success: true, data: undefined, timestamp: new Date().toISOString() };
      },

      async updateRole(userId: string, role: string) {
        await delay(300);
        const session = loadSession() ?? defaultSession();
        const member = DEMO_TEAM.find((m) => m.userId === userId);
        return ok({
          userId,
          role,
          email: member?.email ?? session.user.email,
          name: member?.name ?? session.user.name,
        });
      },
    },

    dashboard: {
      async getStats() {
        await delay(400);
        return ok(DEMO_DASHBOARD);
      },
    },

    analytics: {
      async get(params?: { from?: string; to?: string }) {
        await delay(400);
        return ok({
          ...DEMO_ANALYTICS,
          from: params?.from ?? DEMO_ANALYTICS.from,
          to: params?.to ?? DEMO_ANALYTICS.to,
        });
      },
    },

    widget: {
      async getConfig() {
        await delay(200);
        const session = loadSession() ?? defaultSession();
        return ok({
          storeName: session.tenant.storeName,
          greeting: session.config.prompts.greeting,
          primaryColor: session.config.widgetConfig.primaryColor,
          position: session.config.widgetConfig.position,
          suggestedQuestions: session.config.widgetConfig.suggestedQuestions,
          enabled: true,
          embedCode: WIDGET_EMBED,
        });
      },
    },

    chat: {
      async send(message: string) {
        await delay(900);
        const reply = MOCK_TEST_REPLIES[Math.floor(Math.random() * MOCK_TEST_REPLIES.length)];
        return ok({
          reply: { type: "text", content: reply },
          toolResults: [{ tool: "search_products", success: true }],
          echo: message,
        });
      },
    },
  };
}

export type MockApi = ReturnType<typeof createMockApi>;
