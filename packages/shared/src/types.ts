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
  websiteUrl?: string;
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
    siteUrl?: string;
    lastSyncAt?: string;
    storeName?: string;
    currency?: string;
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

export type OnboardingStepStatus = "completed" | "in_progress" | "pending";

export interface OnboardingState {
  currentStep: OnboardingStep;
  steps: Array<{
    step: OnboardingStep;
    status: OnboardingStepStatus;
    completedAt?: string;
    metadata?: Record<string, unknown>;
  }>;
  canSkip: OnboardingStep[];
  estimatedMinutesRemaining: number;
}

export interface AdvanceOnboardingStepResult {
  previousStep: OnboardingStep;
  currentStep: OnboardingStep;
  onboardingStep: OnboardingStep;
}

export interface OnboardingTestChatResult {
  reply: { type: string; content: string };
  testMessageCount: number;
  canAdvanceToWidget: boolean;
  intent?: string;
  toolResults?: Array<{ tool: string; success: boolean }>;
}

export type ChatIntent = "faq" | "product" | "checkout" | "greeting" | "unknown";

/** Who replies to the customer — bot automation or a human agent (admin / future mobile app). */
export type ConversationHandlingMode = "bot" | "human";

export interface ChatReply {
  type: "text";
  content: string;
}

export interface ChatToolResult {
  tool: string;
  success: boolean;
  [key: string]: unknown;
}

export interface ChatResult {
  conversationId: string;
  reply: ChatReply;
  toolResults?: ChatToolResult[];
  intent?: ChatIntent;
  usage?: { inputTokens: number; outputTokens: number };
  /** Set when inbound was stored but the bot did not auto-reply (human handling). */
  handledBy?: "bot" | "human";
  handlingMode?: ConversationHandlingMode;
}

export type KnowledgeSourceType = "website" | "catalog" | "faq" | "conversation" | "social";
export type KnowledgeSourceStatus = "active" | "syncing" | "error" | "deleted";
export type IngestJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface KnowledgeSource {
  sourceId: string;
  type: KnowledgeSourceType | string;
  name: string;
  status: KnowledgeSourceStatus | string;
  chunkCount: number;
  vectorCount: number;
  lastSyncAt?: string;
  createdAt?: string;
}

export interface IngestJob {
  jobId: string;
  sourceId: string;
  type: string;
  status: IngestJobStatus | string;
  stats?: {
    pagesProcessed?: number;
    chunksCreated?: number;
    tokensEmbedded?: number;
    durationSec?: number;
    errors?: string[];
  };
  progressPct?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  createdAt?: string;
}

export interface AuthContext {
  tenantId: string;
  userId: string;
  role: UserRole;
  email: string;
}
