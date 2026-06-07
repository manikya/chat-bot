import type { ApiResponse, MockApi } from "@commercechat/mock-api";
import type { TenantConfig } from "@commercechat/mock-api";

const TOKEN_KEY = "cc_access_token";

export interface ApiErrorShape {
  code?: string;
  message?: string;
}

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${path}`, { ...options, headers });
  } catch {
    throw { code: "NETWORK_ERROR", message: `Cannot reach API at ${getBaseUrl()}` };
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok || body.success === false) {
    const error = body.error ?? { code: "REQUEST_FAILED", message: res.statusText };
    throw error as ApiErrorShape;
  }
  return body as ApiResponse<T>;
}

export function createHttpApi(): MockApi {
  return {
    auth: {
      signup: (body) => request("/auth/signup", { method: "POST", body: JSON.stringify(body) }),
      login: async (email, password) =>
        request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
      me: () => request("/auth/me"),
      verifyEmail: async (token: string) =>
        request("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
      resendVerification: () =>
        request("/auth/resend-verification", { method: "POST", body: JSON.stringify({}) }),
      forgotPassword: () =>
        request("/auth/forgot-password", { method: "POST", body: JSON.stringify({}) }),
      logout: async () => {
        try {
          return await request("/auth/logout", { method: "POST", body: JSON.stringify({}) });
        } catch {
          return { success: true, data: { loggedOut: true }, timestamp: new Date().toISOString() };
        }
      },
    },
    tenant: {
      getMe: () => request("/api/v1/tenants/me"),
      updateMe: (patch) =>
        request("/api/v1/tenants/me", { method: "PATCH", body: JSON.stringify(patch) }),
      getConfig: () => request("/api/v1/tenants/me/config"),
      updateConfig: (patch: Partial<TenantConfig>) =>
        request("/api/v1/tenants/me/config", { method: "PATCH", body: JSON.stringify(patch) }),
      getLimits: () => request("/api/v1/tenants/me/limits"),
      getUsage: () => request("/api/v1/tenants/me/usage"),
      regenerateWidgetKey: () =>
        request("/api/v1/tenants/me/widget/regenerate-key", { method: "POST", body: JSON.stringify({}) }),
    },
    onboarding: {
      getState: () => request("/api/v1/onboarding"),
      advanceStep: (step, skipped) =>
        request("/api/v1/onboarding/step", { method: "PATCH", body: JSON.stringify({ step, skipped }) }),
      testChat: (message) =>
        request("/api/v1/onboarding/test-chat", { method: "POST", body: JSON.stringify({ message }) }),
    },
    channels: {
      list: () => request("/api/v1/channels"),
      connectMeta: () =>
        request("/api/v1/channels/meta/connect", { method: "POST", body: JSON.stringify({ code: "mock" }) }),
      disconnect: (channel) => request(`/api/v1/channels/meta/${channel}`, { method: "DELETE" }),
      health: () => request("/api/v1/channels/meta/health"),
    },
    conversations: {
      list: (params) => {
        const q = params?.channel ? `?channel=${params.channel}` : "";
        return request(`/api/v1/conversations${q}`);
      },
      get: (id) => request(`/api/v1/conversations/${id}`),
      getMessages: (id) => request(`/api/v1/conversations/${id}/messages`),
    },
    knowledge: {
      listSources: () => request("/api/v1/knowledge/sources"),
      createSource: (body) =>
        request("/api/v1/knowledge/sources", { method: "POST", body: JSON.stringify(body) }),
      syncSource: (sourceId) =>
        request(`/api/v1/knowledge/sources/${sourceId}/sync`, { method: "POST", body: JSON.stringify({}) }),
      listJobs: () => request("/api/v1/knowledge/jobs"),
      deleteSource: (sourceId) => request(`/api/v1/knowledge/sources/${sourceId}`, { method: "DELETE" }),
    },
    team: {
      list: () => request("/api/v1/team"),
      invite: (body) => request("/auth/invite", { method: "POST", body: JSON.stringify(body) }),
    },
    dashboard: {
      getStats: () => request("/api/v1/dashboard/stats"),
    },
    widget: {
      getConfig: () => request("/api/v1/widget/config"),
    },
    chat: {
      send: (message) =>
        request("/api/v1/chat", { method: "POST", body: JSON.stringify({ message, channel: "test" }) }),
    },
  };
}
