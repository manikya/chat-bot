import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import type { Tenant, User } from "@commercechat/mock-api";
import { api, type ApiError } from "./api";
import { unregisterPushFromBackend, syncPushTokenWithBackend } from "./push";
import {
  clearSessionProfile,
  clearTokens,
  hasRefreshSession,
  loadSessionProfile,
} from "./tokens";

interface AuthContextValue {
  user: User | null;
  tenant: Tenant | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isAuthError(error: unknown) {
  const code = (error as ApiError)?.code;
  return code === "UNAUTHORIZED" || code === "TOKEN_EXPIRED" || code === "INVALID_CREDENTIALS";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(async () => {
    await clearTokens();
    await clearSessionProfile();
    setUser(null);
    setTenant(null);
  }, []);

  const refreshMe = useCallback(async () => {
    const hasSession = await hasRefreshSession();
    if (!hasSession) {
      await clearSession();
      return;
    }

    const restored = await api.auth.restoreSession();
    if (!restored) {
      await clearSession();
      return;
    }

    try {
      const res = await api.auth.me();
      setUser(res.data.user);
      setTenant(res.data.tenant);
      void syncPushTokenWithBackend().catch(() => {});
    } catch (error) {
      if (isAuthError(error)) {
        await clearSession();
        return;
      }
      // Offline / transient error — keep cached session (WhatsApp-style stay logged in)
      const cached = await loadSessionProfile();
      if (cached) {
        setUser(cached.user);
        setTenant(cached.tenant);
      }
    }
  }, [clearSession]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const hasSession = await hasRefreshSession();
      if (hasSession) {
        const cached = await loadSessionProfile();
        if (cached && !cancelled) {
          setUser(cached.user);
          setTenant(cached.tenant);
        }
      }
      await refreshMe();
      if (!cancelled) setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshMe]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshMe();
      }
    });
    return () => sub.remove();
  }, [refreshMe]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    setUser(res.data.user);
    setTenant(res.data.tenant);
    void syncPushTokenWithBackend().catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    await unregisterPushFromBackend();
    await api.auth.logout();
    setUser(null);
    setTenant(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      tenant,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      refreshMe,
    }),
    [user, tenant, isLoading, login, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
