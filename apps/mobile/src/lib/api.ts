import type {
  ApiResponse,
  AiWalletOverview,
  BillingCheckoutSession,
  BillingOverview,
  BillingPlan,
  ChannelInfo,
  Conversation,
  ConversationAnalytics,
  ConversationDetail,
  DashboardStats,
  DailySocialContent,
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
  User,
} from "@commercechat/mock-api";
import type {
  MobileAiSnapshotDelta,
  MobileAiSnapshotManifest,
} from "@commercechat/shared/types";
import * as SecureStore from "expo-secure-store";
import {
  clearSessionProfile,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  saveSessionProfile,
  setTokens,
  TOKEN_KEY,
} from "./tokens";

const DEFAULT_API_URL = "https://fimfx57xwl.execute-api.us-east-1.amazonaws.com";
const REQUEST_TIMEOUT_MS = 12000;

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;

const NO_REFRESH = new Set([
  "/auth/accept-invite",
  "/auth/forgot-password",
  "/auth/login",
  "/auth/refresh",
  "/auth/resend-verification",
  "/auth/reset-password",
  "/auth/signup",
  "/auth/verify-email",
]);

let refreshInFlight: Promise<boolean> | null = null;

async function fetchWithTimeout(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshAccessToken(): Promise<boolean> {
  return performTokenRefresh();
}

async function performTokenRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success || !body.data?.accessToken) return false;
      await SecureStore.setItemAsync(TOKEN_KEY, body.data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export type ApiError = { code?: string; message?: string };

export interface CommerceProductListItem {
  sku: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  category?: string;
  categories?: string[];
  inStock?: boolean;
  imageUrl?: string;
  imageUrls?: string[];
  productUrl?: string;
  tags?: string[];
  updatedAt?: string;
}

export interface CommerceCategorySummary {
  name: string;
  productCount: number;
  inStockCount: number;
  sampleSkus: string[];
}

export interface CommerceCatalogData {
  items: CommerceProductListItem[];
  total?: number;
  returned?: number;
  categories?: CommerceCategorySummary[];
  generated?: {
    priceBands?: Array<{ label: string; message: string; min?: number; max?: number }>;
    tags?: string[];
    materials?: string[];
    occasions?: string[];
    recipients?: string[];
    offeringMode?: "products" | "services" | "mixed" | "unknown";
    offeringTypes?: string[];
    starterIntents?: string[];
    intelligenceQuality?: { score: number; warnings: string[] };
    intelligenceGeneratedAt?: string;
    intelligenceModel?: string;
  };
  sources?: Array<{ sourceId: string; productCount: number }>;
}

function noRefreshPath(path: string) {
  const [pathname] = path.split("?");
  return NO_REFRESH.has(pathname);
}

async function request<T>(path: string, options: RequestInit & { _retry?: boolean } = {}): Promise<ApiResponse<T>> {
  const { _retry = false, ...fetchOptions } = options;
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_URL}${path}`, { ...fetchOptions, headers });
  } catch {
    throw { code: "NETWORK_ERROR", message: `Cannot reach API at ${API_URL}` } satisfies ApiError;
  }

  if (res.status === 204) {
    return { success: true, data: undefined, timestamp: new Date().toISOString() } as ApiResponse<T>;
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok || body.success === false) {
    const error = (body.error ?? { code: "REQUEST_FAILED", message: res.statusText }) as ApiError;
    if (
      !_retry &&
      !noRefreshPath(path) &&
      (res.status === 401 || error.code === "TOKEN_EXPIRED" || error.code === "UNAUTHORIZED")
    ) {
      const refreshed = await performTokenRefresh();
      if (refreshed) return request<T>(path, { ...fetchOptions, _retry: true });
      await clearTokens();
      await clearSessionProfile();
    }
    throw error;
  }

  return body as ApiResponse<T>;
}

export const api = {
  auth: {
    async signup(body: Record<string, unknown>) {
      const res = await request<LoginResult>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await setTokens(res.data.accessToken, res.data.refreshToken);
      await saveSessionProfile(res.data.user, res.data.tenant);
      return res;
    },
    async login(email: string, password: string) {
      const res = await request<LoginResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await setTokens(res.data.accessToken, res.data.refreshToken);
      await saveSessionProfile(res.data.user, res.data.tenant);
      return res;
    },
    async restoreSession() {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return false;
      const accessToken = await getAccessToken();
      if (!accessToken) {
        return refreshAccessToken();
      }
      return true;
    },
    async me() {
      const res = await request<{ user: User; tenant: Tenant }>("/auth/me");
      await saveSessionProfile(res.data.user, res.data.tenant);
      return res;
    },
    verifyEmail(token: string) {
      return request("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
    },
    resendVerification(email: string) {
      return request("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },
    forgotPassword(email: string) {
      return request("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },
    resetPassword(token: string, password: string) {
      return request("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
    },
    async acceptInvite(body: { token: string; password: string; name?: string }) {
      const res = await request<LoginResult>("/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await setTokens(res.data.accessToken, res.data.refreshToken);
      await saveSessionProfile(res.data.user, res.data.tenant);
      return res;
    },
    async logout() {
      const refreshToken = await getRefreshToken();
      try {
        if (refreshToken) {
          await request("/auth/logout", {
            method: "POST",
            body: JSON.stringify({ refreshToken }),
          });
        }
      } catch {
        /* ignore */
      }
      await clearTokens();
      await clearSessionProfile();
    },
  },
  tenant: {
    getMe() {
      return request<Tenant>("/api/v1/tenants/me");
    },
    updateMe(patch: { storeName?: string; timezone?: string; websiteUrl?: string }) {
      return request<Tenant>("/api/v1/tenants/me", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    },
    getConfig() {
      return request<TenantConfig>("/api/v1/tenants/me/config");
    },
    updateConfig(patch: Partial<TenantConfig>) {
      return request<TenantConfig>("/api/v1/tenants/me/config", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    },
    getLimits() {
      return request<PlanLimits>("/api/v1/tenants/me/limits");
    },
    getUsage() {
      return request<Usage>("/api/v1/tenants/me/usage");
    },
    regenerateWidgetKey() {
      return request<{ apiKey: string; prefix: string; createdAt: string; embedCode: string }>(
        "/api/v1/tenants/me/widget/regenerate-key",
        { method: "POST", body: JSON.stringify({}) }
      );
    },
  },
  onboarding: {
    getState() {
      return request<OnboardingState>("/api/v1/onboarding");
    },
    advanceStep(step: string, skipped?: boolean) {
      return request<OnboardingState>("/api/v1/onboarding/step", {
        method: "PATCH",
        body: JSON.stringify({ step, skipped }),
      });
    },
    testChat(message: string) {
      return request<{
        reply: { type: string; content: string };
        testMessageCount: number;
        canAdvanceToWidget: boolean;
        intent?: string;
      }>("/api/v1/onboarding/test-chat", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
    },
  },
  channels: {
    list() {
      return request<{ channels: ChannelInfo[] }>("/api/v1/channels");
    },
    disconnect(channel: string) {
      return request<{ disconnected: boolean }>(`/api/v1/channels/meta/${channel}`, {
        method: "DELETE",
      });
    },
    health() {
      return request<Record<string, { status: string; detail?: string }>>(
        "/api/v1/channels/meta/health"
      );
    },
    connectMetaDev() {
      return request<{ connected: string[] }>("/api/v1/channels/meta/connect-dev", {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    connectMessengerDev() {
      return request<{ connected: string[] }>("/api/v1/channels/meta/connect-messenger-dev", {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
  },
  conversations: {
    list(params?: {
      channel?: string;
      status?: string;
      handlingMode?: "bot" | "human";
      limit?: number;
    }) {
      const search = new URLSearchParams();
      if (params?.channel) search.set("channel", params.channel);
      if (params?.status) search.set("status", params.status);
      if (params?.handlingMode) search.set("handlingMode", params.handlingMode);
      if (params?.limit) search.set("limit", String(params.limit));
      const qs = search.toString();
      return request<{ items: Conversation[] }>(`/api/v1/conversations${qs ? `?${qs}` : ""}`);
    },
    get(id: string) {
      return request<ConversationDetail>(`/api/v1/conversations/${id}`);
    },
    getMessages(id: string) {
      return request<{ items: Message[] }>(`/api/v1/conversations/${id}/messages`);
    },
    setHandling(
      id: string,
      body: { mode: "bot" | "human"; notifyCustomer?: boolean; assignedToUserId?: string | null }
    ) {
      return request<{
        conversationId: string;
        handlingMode: "bot" | "human";
        assignedToUserId?: string | null;
        manualReplySupported: boolean;
      }>(`/api/v1/conversations/${id}/handling`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    reply(id: string, content: string) {
      return request<{ messageId: string; content: string }>(`/api/v1/conversations/${id}/reply`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
    },
  },
  knowledge: {
    listSources() {
      return request<{ items: KnowledgeSource[] }>("/api/v1/knowledge/sources");
    },
    createSource(body: { type: string; name: string; config?: Record<string, unknown> }) {
      return request<KnowledgeSource>("/api/v1/knowledge/sources", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    syncSource(sourceId: string) {
      return request<{ jobId: string; sourceId: string; status: string; type?: string }>(
        `/api/v1/knowledge/sources/${sourceId}/sync`,
        { method: "POST", body: JSON.stringify({}) }
      );
    },
    deleteSource(sourceId: string) {
      return request<{ sourceId: string; deleted: boolean }>(
        `/api/v1/knowledge/sources/${sourceId}`,
        { method: "DELETE" }
      );
    },
    listJobs() {
      return request<{ items: IngestJob[] }>("/api/v1/knowledge/jobs");
    },
    cancelJob(jobId: string) {
      return request<IngestJob>(`/api/v1/knowledge/jobs/${jobId}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    listFaq() {
      return request<{ sourceId: string | null; items: Array<{ question: string; answer: string }> }>(
        "/api/v1/knowledge/faq"
      );
    },
    ingestFaq(items: Array<{ question: string; answer: string }>, append = false) {
      return request<{
        sourceId: string;
        itemCount: number;
        items: Array<{ question: string; answer: string }>;
        status: string;
      }>("/api/v1/knowledge/faq", {
        method: "POST",
        body: JSON.stringify({ items, append }),
      });
    },
    getPageVoice() {
      return request<{
        conversationIngestEnabled?: boolean;
        sourceId: string | null;
        learningPaused: boolean;
        pairCount: number;
        vectorCount: number;
        lastCaptureAt: string | null;
        lastSyncAt: string | null;
        platform: string;
        preview: Array<{ customerText: string; ownerText: string; capturedAt: string }>;
      }>("/api/v1/knowledge/page-voice");
    },
    updatePageVoice(body: { learningPaused?: boolean }) {
      return request("/api/v1/knowledge/page-voice", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    syncPageVoice() {
      return request<{ jobId: string; sourceId: string; status: string; type?: string }>(
        "/api/v1/knowledge/page-voice/sync",
        { method: "POST", body: JSON.stringify({}) }
      );
    },
  },
  mobileAi: {
    getSnapshotManifest() {
      return request<MobileAiSnapshotManifest>("/api/v1/mobile-ai/snapshot?kind=manifest");
    },
    getSnapshotChunks(params?: { sinceVersion?: number; maxChunks?: number }) {
      const search = new URLSearchParams();
      search.set("kind", "chunks");
      if (params?.sinceVersion != null) search.set("sinceVersion", String(params.sinceVersion));
      if (params?.maxChunks != null) search.set("maxChunks", String(params.maxChunks));
      const qs = search.toString();
      return request<MobileAiSnapshotDelta>(`/api/v1/mobile-ai/snapshot?${qs}`);
    },
  },
  commerce: {
    listProducts(params?: { q?: string; limit?: number }) {
      const search = new URLSearchParams();
      if (params?.q) search.set("q", params.q);
      if (params?.limit != null) search.set("limit", String(params.limit));
      const qs = search.toString();
      return request<CommerceCatalogData>(`/api/v1/commerce/products${qs ? `?${qs}` : ""}`);
    },
    wordpressStatus() {
      return request<{
        connected: boolean;
        siteUrl?: string;
        lastSyncAt?: string;
        sourceId?: string;
        widgetEnabled?: boolean;
      }>("/api/v1/commerce/wordpress/status");
    },
    syncWordPress() {
      return request<{ jobId: string; sourceId: string; status: string; type?: string }>(
        "/api/v1/commerce/wordpress/sync",
        { method: "POST", body: JSON.stringify({}) }
      );
    },
    setWordPressWidgetEnabled(widgetEnabled: boolean) {
      return request<{ widgetEnabled: boolean }>("/api/v1/commerce/wordpress/widget", {
        method: "PATCH",
        body: JSON.stringify({ widgetEnabled }),
      });
    },
    shopifyStatus() {
      return request<{
        connected: boolean;
        shopDomain?: string;
        lastSyncAt?: string;
        sourceId?: string;
        widgetEnabled?: boolean;
      }>("/api/v1/commerce/shopify/status");
    },
    syncShopify() {
      return request<{ jobId: string; sourceId: string; status: string; type?: string }>(
        "/api/v1/commerce/shopify/sync",
        { method: "POST", body: JSON.stringify({}) }
      );
    },
    setShopifyWidgetEnabled(widgetEnabled: boolean) {
      return request<{ widgetEnabled: boolean }>("/api/v1/commerce/shopify/widget", {
        method: "PATCH",
        body: JSON.stringify({ widgetEnabled }),
      });
    },
  },
  team: {
    list() {
      return request<{ items: TeamMember[] }>("/api/v1/team");
    },
    invite(body: { email: string; role: string; name?: string }) {
      return request<{ invited: boolean }>("/auth/invite", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    updateRole(userId: string, role: string) {
      return request(`/api/v1/team/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
    },
    remove(userId: string) {
      return request(`/api/v1/team/${userId}`, { method: "DELETE" });
    },
  },
  dashboard: {
    getStats() {
      return request<DashboardStats>("/api/v1/dashboard/stats");
    },
  },
  analytics: {
    get(params?: { from?: string; to?: string }) {
      const search = new URLSearchParams();
      if (params?.from) search.set("from", params.from);
      if (params?.to) search.set("to", params.to);
      const qs = search.toString();
      return request<ConversationAnalytics>(`/api/v1/analytics${qs ? `?${qs}` : ""}`);
    },
  },
  socialContent: {
    getDaily() {
      return request<DailySocialContent | null>("/api/v1/social-content/daily");
    },
    generateDaily() {
      return request<DailySocialContent>("/api/v1/social-content/daily/generate", {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
  },
  billing: {
    getPlans() {
      return request<{ plans: BillingPlan[] }>("/api/v1/billing/plans");
    },
    getOverview() {
      return request<BillingOverview>("/api/v1/billing/overview");
    },
    getSubscription() {
      return request<BillingOverview["subscription"]>("/api/v1/billing/subscription");
    },
    getAiWallet() {
      return request<AiWalletOverview>("/api/v1/billing/ai-wallet");
    },
    topUpAiWallet(body: { amountMinor: number; currency?: string; resumeAi?: boolean }) {
      return request<AiWalletOverview>("/api/v1/billing/ai-wallet/topup", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    resumeAiWallet() {
      return request<AiWalletOverview>("/api/v1/billing/ai-wallet/resume", {
        method: "POST",
      });
    },
    checkout(body: { plan: string; successUrl?: string; cancelUrl?: string }) {
      return request<BillingCheckoutSession>("/api/v1/billing/checkout", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    cancel() {
      return request<{ cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null }>(
        "/api/v1/billing/cancel",
        { method: "POST" }
      );
    },
    reactivate() {
      return request<{ cancelAtPeriodEnd: boolean }>("/api/v1/billing/reactivate", {
        method: "POST",
      });
    },
  },
  widget: {
    getConfig() {
      return request<{
        storeName?: string;
        greeting?: string;
        primaryColor: string;
        position?: string;
        suggestedQuestions?: string[];
        enabled?: boolean;
        embedCode: string;
      }>("/api/v1/widget/config");
    },
  },
  chat: {
    send(message: string) {
      return request<{ conversationId: string; reply: { type: string; content: string } }>(
        "/api/v1/chat",
        { method: "POST", body: JSON.stringify({ message, channel: "test" }) }
      );
    },
  },
  devices: {
    register(expoPushToken: string, platform: string) {
      return request<{ registered: boolean; deviceKey: string }>("/api/v1/devices/register", {
        method: "POST",
        body: JSON.stringify({ expoPushToken, platform }),
      });
    },
    unregister(expoPushToken: string) {
      return request<{ unregistered: boolean }>("/api/v1/devices/register", {
        method: "DELETE",
        body: JSON.stringify({ expoPushToken }),
      });
    },
  },
};
