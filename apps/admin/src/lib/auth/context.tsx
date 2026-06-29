"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { LoginResult, Tenant, User } from "@commercechat/mock-api";
import { SessionExpiredDialog } from "@/components/auth/session-expired-dialog";
import { api } from "@/lib/api";
import { TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/lib/api/http-client";
import { onSessionExpired } from "@/lib/auth/session-expired";

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  platformLogin: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setSession: (data: LoginResult) => void;
  dismissSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const dismissSessionExpired = useCallback(() => setSessionExpired(false), []);

  const setSession = useCallback((data: LoginResult) => {
    localStorage.setItem(TOKEN_KEY, data.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
    setUser(data.user);
    setTenant(data.tenant);
    setSessionExpired(false);
  }, []);

  useEffect(() => {
    return onSessionExpired(() => {
      setUser(null);
      setTenant(null);
      setSessionExpired(true);
    });
  }, []);

  const refreshMe = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!token && !refreshToken) {
      setUser(null);
      setTenant(null);
      return;
    }
    try {
      const res = await api.auth.me();
      setUser(res.data.user);
      setTenant(res.data.tenant);
    } catch {
      setUser(null);
      setTenant(null);
    }
  }, []);

  useEffect(() => {
    refreshMe().finally(() => setIsLoading(false));
  }, [refreshMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.auth.login(email, password);
      setSession(res.data);
    },
    [setSession]
  );

  const platformLogin = useCallback(
    async (email: string, password: string) => {
      const res = await api.platformAuth.login(email, password);
      setSession(res.data);
    },
    [setSession]
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
    setUser(null);
    setTenant(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      tenant,
      isLoading,
      isAuthenticated: !!user,
      sessionExpired,
      login,
      platformLogin,
      logout,
      refreshMe,
      setSession,
      dismissSessionExpired,
    }),
    [user, tenant, isLoading, sessionExpired, login, platformLogin, logout, refreshMe, setSession, dismissSessionExpired]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SessionExpiredDialog />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
