import type {
  ApiResponse,
  Conversation,
  ConversationDetail,
  LoginResult,
  Message,
  Tenant,
  User,
} from "@commercechat/mock-api";
import * as SecureStore from "expo-secure-store";
import { clearTokens, getAccessToken, getRefreshToken, setTokens, TOKEN_KEY } from "./tokens";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

const NO_REFRESH = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/refresh",
]);

let refreshInFlight: Promise<boolean> | null = null;

async function performTokenRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
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
    res = await fetch(`${API_URL}${path}`, { ...fetchOptions, headers });
  } catch {
    throw { code: "NETWORK_ERROR", message: `Cannot reach API at ${API_URL}` } satisfies ApiError;
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok || body.success === false) {
    const error = (body.error ?? { code: "REQUEST_FAILED", message: res.statusText }) as ApiError;
    if (
      !_retry &&
      !NO_REFRESH.has(path) &&
      (res.status === 401 || error.code === "TOKEN_EXPIRED" || error.code === "UNAUTHORIZED")
    ) {
      const refreshed = await performTokenRefresh();
      if (refreshed) return request<T>(path, { ...fetchOptions, _retry: true });
      await clearTokens();
    }
    throw error;
  }

  return body as ApiResponse<T>;
}

export const api = {
  auth: {
    async login(email: string, password: string) {
      const res = await request<LoginResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await setTokens(res.data.accessToken, res.data.refreshToken);
      return res;
    },
    async me() {
      return request<{ user: User; tenant: Tenant }>("/auth/me");
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
    },
  },
  conversations: {
    list(params?: { channel?: string; handlingMode?: "bot" | "human" }) {
      const search = new URLSearchParams();
      if (params?.channel) search.set("channel", params.channel);
      if (params?.handlingMode) search.set("handlingMode", params.handlingMode);
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
      body: { mode: "bot" | "human"; notifyCustomer?: boolean }
    ) {
      return request<{
        conversationId: string;
        handlingMode: "bot" | "human";
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
};
