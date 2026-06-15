import type {
  ApiResponse,
  BillingCheckoutSession,
  BillingOverview,
  BillingPlan,
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
  PlanLimits,
  TeamMember,
  Tenant,
  TenantConfig,
  Usage,
} from "@commercechat/mock-api";
import { notifySessionExpired } from "@/lib/auth/session-expired";

export const TOKEN_KEY = "cc_access_token";
export const REFRESH_TOKEN_KEY = "cc_refresh_token";

export interface ApiErrorShape {
  code?: string;
  message?: string;
}

type RequestOptions = RequestInit & { _authRetry?: boolean };

/** Paths where 401 is expected credentials failure — never attempt token refresh */
const NO_REFRESH_PATHS = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
  "/auth/resend-verification",
  "/auth/accept-invite",
]);

let refreshInFlight: Promise<boolean> | null = null;

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function shouldAttemptRefresh(
  path: string,
  status: number,
  error: ApiErrorShape | undefined,
  isRetry: boolean
): boolean {
  if (isRetry || NO_REFRESH_PATHS.has(path)) return false;
  if (typeof window === "undefined") return false;
  if (!localStorage.getItem(REFRESH_TOKEN_KEY)) return false;
  return status === 401 || error?.code === "TOKEN_EXPIRED" || error?.code === "UNAUTHORIZED";
}

function clearSessionAndNotifyExpired() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  const isPublic =
    window.location.pathname.startsWith("/login") ||
    window.location.pathname.startsWith("/signup") ||
    window.location.pathname.startsWith("/forgot-password") ||
    window.location.pathname.startsWith("/reset-password") ||
    window.location.pathname.startsWith("/verify-email");
  if (!isPublic) {
    notifySessionExpired();
  }
}

/** Raw fetch for refresh — must not go through request() to avoid recursion */
async function performTokenRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${getBaseUrl()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success || !body.data?.accessToken) return false;
      localStorage.setItem(TOKEN_KEY, body.data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { _authRetry = false, ...fetchOptions } = options;
  const token = getToken();
  const isFormData =
    typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${path}`, { ...fetchOptions, headers });
  } catch {
    throw { code: "NETWORK_ERROR", message: `Cannot reach API at ${getBaseUrl()}` };
  }

  if (res.status === 204) {
    return { success: true, data: undefined, timestamp: new Date().toISOString() } as ApiResponse<T>;
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok || body.success === false) {
    const error = (body.error ?? { code: "REQUEST_FAILED", message: res.statusText }) as ApiErrorShape;

    if (shouldAttemptRefresh(path, res.status, error, _authRetry)) {
      const refreshed = await performTokenRefresh();
      if (refreshed) {
        return request<T>(path, { ...fetchOptions, _authRetry: true });
      }
      clearSessionAndNotifyExpired();
    }

    throw error;
  }
  return body as ApiResponse<T>;
}

export function createHttpApi() {
  return {
    auth: {
      signup: (body: Record<string, unknown>) =>
        request<LoginResult>("/auth/signup", { method: "POST", body: JSON.stringify(body) }),
      login: async (email: string, password: string) =>
        request<LoginResult>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
      me: () => request<LoginResult>("/auth/me"),
      refresh: async () => {
        const ok = await performTokenRefresh();
        if (!ok) throw { code: "UNAUTHORIZED", message: "Unable to refresh session" };
        return {
          success: true,
          data: {
            accessToken: localStorage.getItem(TOKEN_KEY)!,
            expiresIn: 3600,
            tokenType: "Bearer",
          },
          timestamp: new Date().toISOString(),
        };
      },
      verifyEmail: async (token: string) =>
        request("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
      resendVerification: (email: string) =>
        request("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) }),
      forgotPassword: (email: string) =>
        request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
      resetPassword: (token: string, password: string) =>
        request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
      acceptInvite: (body: { token: string; password: string; name?: string }) =>
        request<LoginResult>("/auth/accept-invite", { method: "POST", body: JSON.stringify(body) }),
      logout: async () => {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        try {
          if (refreshToken) {
            await request("/auth/logout", {
              method: "POST",
              body: JSON.stringify({ refreshToken }),
            });
          }
        } catch {
          /* session may already be invalid */
        }
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        return { success: true, data: { loggedOut: true }, timestamp: new Date().toISOString() };
      },
    },
    tenant: {
      getMe: () => request<Tenant>("/api/v1/tenants/me"),
      updateMe: (patch: { storeName?: string; timezone?: string; websiteUrl?: string }) =>
        request<Tenant>("/api/v1/tenants/me", { method: "PATCH", body: JSON.stringify(patch) }),
      uploadLogo: (file: File) => {
        const form = new FormData();
        form.append("file", file);
        return request<{ logoUrl: string }>("/api/v1/tenants/me/logo", { method: "POST", body: form });
      },
      presignLogo: (contentType: string) =>
        request<{ uploadUrl: string; key: string }>("/api/v1/tenants/me/logo/presign", {
          method: "POST",
          body: JSON.stringify({ contentType }),
        }),
      completeLogo: (key: string) =>
        request<{ logoUrl: string }>("/api/v1/tenants/me/logo/complete", {
          method: "POST",
          body: JSON.stringify({ key }),
        }),
      getConfig: () => request<TenantConfig>("/api/v1/tenants/me/config"),
      updateConfig: (patch: Partial<TenantConfig>) =>
        request<TenantConfig>("/api/v1/tenants/me/config", { method: "PATCH", body: JSON.stringify(patch) }),
      getLimits: () => request<PlanLimits>("/api/v1/tenants/me/limits"),
      getUsage: () => request<Usage>("/api/v1/tenants/me/usage"),
      regenerateWidgetKey: () =>
        request<{ apiKey: string; prefix: string; createdAt: string; embedCode: string }>(
          "/api/v1/tenants/me/widget/regenerate-key",
          { method: "POST", body: JSON.stringify({}) }
        ),
    },
    onboarding: {
      getState: () => request<OnboardingState>("/api/v1/onboarding"),
      advanceStep: (step: string, skipped?: boolean) =>
        request<OnboardingState>("/api/v1/onboarding/step", {
          method: "PATCH",
          body: JSON.stringify({ step, skipped }),
        }),
      testChat: (message: string) =>
        request<{
          reply: { type: string; content: string };
          testMessageCount: number;
          canAdvanceToWidget: boolean;
          intent?: string;
          toolResults?: Array<{ tool: string; success: boolean }>;
        }>("/api/v1/onboarding/test-chat", {
          method: "POST",
          body: JSON.stringify({ message }),
        }),
    },
    channels: {
      list: () => request<{ channels: ChannelInfo[] }>("/api/v1/channels"),
      connectMeta: (body: {
        code?: string;
        redirectUri?: string;
        wabaId?: string;
        phoneNumberId?: string;
        accessToken?: string;
        displayPhone?: string;
      }) =>
        request("/api/v1/channels/meta/connect", { method: "POST", body: JSON.stringify(body) }),
      connectMessenger: (body: {
        code?: string;
        redirectUri?: string;
        pageId?: string;
        pageName?: string;
        pageAccessToken?: string;
      }) =>
        request("/api/v1/channels/meta/connect-messenger", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      connectInstagram: (body: {
        code?: string;
        redirectUri?: string;
        pageId?: string;
        pageName?: string;
        pageAccessToken?: string;
        igUserId?: string;
        igUsername?: string;
      }) =>
        request("/api/v1/channels/meta/connect-instagram", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      connectMetaDev: () =>
        request<{
          connected: string[];
          whatsapp: { phoneNumberId: string; displayPhone?: string; wabaId: string; status: string };
        }>("/api/v1/channels/meta/connect-dev", { method: "POST", body: JSON.stringify({}) }),
      connectMessengerDev: () =>
        request<{
          connected: string[];
          messenger: { pageId: string; pageName: string; status: string };
        }>("/api/v1/channels/meta/connect-messenger-dev", {
          method: "POST",
          body: JSON.stringify({}),
        }),
      metaDevStatus: () =>
        request<{
          devConnectAvailable: boolean;
          messengerDevConnectAvailable: boolean;
          oauthRedirectUri?: string;
        }>("/api/v1/channels/meta/dev-status"),
      disconnect: (channel: string) =>
        request<{ disconnected: boolean }>(`/api/v1/channels/meta/${channel}`, { method: "DELETE" }),
      health: () => request<Record<string, { status: string; detail?: string }>>("/api/v1/channels/meta/health"),
    },
    conversations: {
      list: (params?: { channel?: string; handlingMode?: "bot" | "human" }) => {
        const search = new URLSearchParams();
        if (params?.channel) search.set("channel", params.channel);
        if (params?.handlingMode) search.set("handlingMode", params.handlingMode);
        const qs = search.toString();
        return request<{ items: Conversation[] }>(`/api/v1/conversations${qs ? `?${qs}` : ""}`);
      },
      get: (id: string) => request<ConversationDetail>(`/api/v1/conversations/${id}`),
      getMessages: (id: string) => request<{ items: Message[] }>(`/api/v1/conversations/${id}/messages`),
      setHandling: (
        id: string,
        body: { mode: "bot" | "human"; notifyCustomer?: boolean; assignedToUserId?: string | null }
      ) =>
        request<{
          conversationId: string;
          handlingMode: "bot" | "human";
          assignedToUserId: string | null;
          handoffAt: string | null;
          manualReplySupported: boolean;
        }>(`/api/v1/conversations/${id}/handling`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      reply: (id: string, content: string) =>
        request<{
          conversationId: string;
          messageId: string;
          content: string;
          channel: string;
          handlingMode: "human";
        }>(`/api/v1/conversations/${id}/reply`, {
          method: "POST",
          body: JSON.stringify({ content }),
        }),
    },
    knowledge: {
      listSources: () => request<{ items: KnowledgeSource[] }>("/api/v1/knowledge/sources"),
      createSource: (body: { type: string; name: string; config?: Record<string, unknown> }) =>
        request<KnowledgeSource>("/api/v1/knowledge/sources", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      createCatalogSource: (file: File, name = "Product catalog") => {
        const form = new FormData();
        form.append("type", "catalog");
        form.append("name", name);
        form.append("file", file);
        return request<KnowledgeSource>("/api/v1/knowledge/sources", { method: "POST", body: form });
      },
      syncSource: (sourceId: string) =>
        request<{ jobId: string; sourceId: string; status: string; type?: string }>(
          `/api/v1/knowledge/sources/${sourceId}/sync`,
          { method: "POST", body: JSON.stringify({}) }
        ),
      listJobs: () => request<{ items: IngestJob[] }>("/api/v1/knowledge/jobs"),
      getJob: (jobId: string) => request<IngestJob>(`/api/v1/knowledge/jobs/${jobId}`),
      deleteSource: (sourceId: string) =>
        request<{ sourceId: string; deleted: boolean }>(
          `/api/v1/knowledge/sources/${sourceId}`,
          { method: "DELETE" }
        ),
      listFaq: () =>
        request<{ sourceId: string | null; items: Array<{ question: string; answer: string }> }>(
          "/api/v1/knowledge/faq"
        ),
      ingestFaq: (items: Array<{ question: string; answer: string }>, append = false) =>
        request<{
          sourceId: string;
          itemCount: number;
          items: Array<{ question: string; answer: string }>;
          status: string;
        }>("/api/v1/knowledge/faq", {
          method: "POST",
          body: JSON.stringify({ items, append }),
        }),
      detectPlatform: (url: string) =>
        request<{
          platform: "woocommerce" | "shopify" | "generic";
          normalizedUrl: string;
          signals: string[];
          commerceChatPluginInstalled: boolean;
        }>("/api/v1/knowledge/detect-platform", {
          method: "POST",
          body: JSON.stringify({ url }),
        }),
      getPageVoice: () =>
        request<{
          conversationIngestEnabled?: boolean;
          sourceId: string | null;
          learningPaused: boolean;
          pairCount: number;
          vectorCount: number;
          lastCaptureAt: string | null;
          lastSyncAt: string | null;
          platform: string;
          preview: Array<{ customerText: string; ownerText: string; capturedAt: string }>;
        }>("/api/v1/knowledge/page-voice"),
      exportPageVoice: () =>
        request<{
          format: string;
          pairCount: number;
          pairs: Array<{
            customerText: string;
            ownerText: string;
            platform: string;
            capturedAt: string;
          }>;
        }>("/api/v1/knowledge/page-voice/export"),
      updatePageVoice: (body: { learningPaused?: boolean }) =>
        request("/api/v1/knowledge/page-voice", {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      syncPageVoice: () =>
        request<{ jobId: string; sourceId: string; status: string; type?: string }>(
          "/api/v1/knowledge/page-voice/sync",
          { method: "POST", body: JSON.stringify({}) }
        ),
      uploadPageVoice: (file: File) => {
        const form = new FormData();
        form.append("file", file);
        return request<{
          pairCount: number;
          added: number;
          sourceId: string;
          jobId?: string;
          status: string;
        }>("/api/v1/knowledge/page-voice/upload", { method: "POST", body: form });
      },
    },
    commerce: {
      listProducts: (params?: { q?: string; limit?: number }) => {
        const search = new URLSearchParams();
        if (params?.q) search.set("q", params.q);
        if (params?.limit != null) search.set("limit", String(params.limit));
        const qs = search.toString();
        return request<{ items: Array<{ sku: string; name: string; price: number }> }>(
          `/api/v1/commerce/products${qs ? `?${qs}` : ""}`
        );
      },
      wordpressStatus: () =>
        request<{ connected: boolean; siteUrl?: string; lastSyncAt?: string }>(
          "/api/v1/commerce/wordpress/status"
        ),
      connectWordPress: (body: { siteUrl: string; apiKey: string }) =>
        request("/api/v1/commerce/wordpress/connect", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      syncWordPress: () =>
        request<{ jobId: string; sourceId: string; status: string; type?: string }>(
          "/api/v1/commerce/wordpress/sync",
          { method: "POST", body: JSON.stringify({}) }
        ),
      disconnectWordPress: () =>
        request("/api/v1/commerce/wordpress", { method: "DELETE" }),
      shopifyStatus: () =>
        request<{ connected: boolean; shopDomain?: string; lastSyncAt?: string; sourceId?: string }>(
          "/api/v1/commerce/shopify/status"
        ),
      connectShopify: (body: { shopDomain: string; accessToken: string }) =>
        request("/api/v1/commerce/shopify/connect", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      syncShopify: () =>
        request<{ jobId: string; sourceId: string; status: string; type?: string }>(
          "/api/v1/commerce/shopify/sync",
          { method: "POST", body: JSON.stringify({}) }
        ),
      disconnectShopify: () =>
        request("/api/v1/commerce/shopify", { method: "DELETE" }),
    },
    team: {
      list: () => request<{ items: TeamMember[] }>("/api/v1/team"),
      invite: (body: { email: string; role: string; name?: string }) =>
        request<{ invited: boolean }>("/auth/invite", { method: "POST", body: JSON.stringify(body) }),
      remove: (userId: string) => request(`/api/v1/team/${userId}`, { method: "DELETE" }),
      updateRole: (userId: string, role: string) =>
        request(`/api/v1/team/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
    },
    dashboard: {
      getStats: () => request<DashboardStats>("/api/v1/dashboard/stats"),
    },
    analytics: {
      get: (params?: { from?: string; to?: string }) => {
        const search = new URLSearchParams();
        if (params?.from) search.set("from", params.from);
        if (params?.to) search.set("to", params.to);
        const qs = search.toString();
        return request<ConversationAnalytics>(`/api/v1/analytics${qs ? `?${qs}` : ""}`);
      },
    },
    billing: {
      getPlans: () => request<{ plans: BillingPlan[] }>("/api/v1/billing/plans"),
      getSubscription: () => request<BillingOverview["subscription"]>("/api/v1/billing/subscription"),
      getOverview: () => request<BillingOverview>("/api/v1/billing/overview"),
      checkout: (body: { plan: string; successUrl?: string; cancelUrl?: string }) =>
        request<BillingCheckoutSession>("/api/v1/billing/checkout", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      cancel: () =>
        request<{ cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null }>(
          "/api/v1/billing/cancel",
          { method: "POST" }
        ),
      reactivate: () =>
        request<{ cancelAtPeriodEnd: boolean }>("/api/v1/billing/reactivate", { method: "POST" }),
    },
    widget: {
      getConfig: () =>
        request<{
          storeName?: string;
          greeting?: string;
          primaryColor: string;
          position?: string;
          suggestedQuestions?: string[];
          enabled?: boolean;
          embedCode: string;
        }>("/api/v1/widget/config"),
    },
    chat: {
      send: (message: string) =>
        request<{ conversationId: string; reply: { type: string; content: string } }>(
          "/api/v1/chat",
          { method: "POST", body: JSON.stringify({ message, channel: "test" }) }
        ),
    },
  };
}

export type AdminApi = ReturnType<typeof createHttpApi>;
