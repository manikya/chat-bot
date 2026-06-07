import {
  DEMO_CONFIG,
  DEMO_ONBOARDING,
  DEMO_TENANT,
  DEMO_USER,
} from "../fixtures";
import type { OnboardingState, Tenant, TenantConfig, User } from "../types";

export interface MockSession {
  user: User;
  tenant: Tenant;
  config: TenantConfig;
  onboarding: OnboardingState;
  testMessageCount: number;
}

export function defaultSession(overrides?: Partial<MockSession>): MockSession {
  return {
    user: { ...DEMO_USER },
    tenant: { ...DEMO_TENANT },
    config: structuredClone(DEMO_CONFIG),
    onboarding: structuredClone(DEMO_ONBOARDING),
    testMessageCount: 0,
    ...overrides,
  };
}

export class MemorySessionStore {
  private byToken = new Map<string, MockSession>();
  private byEmail = new Map<string, MockSession>();

  getByToken(token: string | undefined): MockSession | null {
    if (!token) return null;
    return this.byToken.get(token) ?? null;
  }

  getByEmail(email: string): MockSession | null {
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }

  saveByEmail(email: string, session: MockSession) {
    this.byEmail.set(email.toLowerCase(), session);
  }

  issueToken(session: MockSession): string {
    const token = `mock_access_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.byToken.set(token, session);
    this.byEmail.set(session.user.email.toLowerCase(), session);
    return token;
  }

  revokeToken(token: string) {
    this.byToken.delete(token);
  }

  resolve(token: string | undefined, email?: string): MockSession {
    return (
      this.getByToken(token) ??
      (email ? this.getByEmail(email) : null) ??
      defaultSession()
    );
  }
}

export const store = new MemorySessionStore();
