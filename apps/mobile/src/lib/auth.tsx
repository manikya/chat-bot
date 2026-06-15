import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Tenant, User } from "@commercechat/mock-api";
import { api } from "./api";
import { getAccessToken } from "./tokens";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
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

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    setUser(res.data.user);
    setTenant(res.data.tenant);
  }, []);

  const logout = useCallback(async () => {
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
