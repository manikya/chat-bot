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
import { api } from "@/lib/api";

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setSession: (data: LoginResult) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "cc_access_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setSession = useCallback((data: LoginResult) => {
    localStorage.setItem(TOKEN_KEY, data.accessToken);
    setUser(data.user);
    setTenant(data.tenant);
  }, []);

  const refreshMe = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setTenant(null);
      return;
    }
    const res = await api.auth.me();
    setUser(res.data.user);
    setTenant(res.data.tenant);
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

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* logout Lambda not implemented — clear local session anyway */
    }
    localStorage.removeItem(TOKEN_KEY);
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
      setSession,
    }),
    [user, tenant, isLoading, login, logout, refreshMe, setSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
