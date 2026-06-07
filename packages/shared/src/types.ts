export type UserRole = "owner" | "admin" | "viewer";

export type OnboardingStep =
  | "profile"
  | "channels"
  | "knowledge"
  | "catalog"
  | "test"
  | "widget"
  | "complete";

export type TenantStatus = "trial" | "active" | "suspended" | "cancelled" | "deleted";
export type TenantPlan = "trial" | "starter" | "pro" | "business" | "enterprise";

export interface User {
  userId: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  mfaEnabled: boolean;
}

export interface TenantProfile {
  tenantId: string;
  storeName: string;
  ownerEmail: string;
  plan: TenantPlan;
  status: TenantStatus;
  timezone: string;
  onboardingStep: OnboardingStep;
  logoUrl?: string;
  widgetApiKeyPrefix?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantConfig {
  llmConfig: {
    primaryProvider: string;
    models: { faq: string; product: string; checkout: string };
    embeddingModel: string;
  };
  prompts: {
    systemPrompt: string;
    greeting: string;
    handoffMessage: string;
  };
  enabledChannels: string[];
  commerceConnector: {
    type: string;
    status: string;
    checkoutBaseUrl: string;
  };
  widgetConfig: {
    primaryColor: string;
    position: string;
    suggestedQuestions: string[];
  };
  featureFlags: Record<string, boolean>;
}

export interface PlanLimits {
  maxMessages: number;
  maxSources: number;
  maxVectors: number;
  maxTeamMembers: number;
  enabledChannels: string[];
}

export interface AuthContext {
  tenantId: string;
  userId: string;
  role: UserRole;
  email: string;
}
