export type UserRole = "owner" | "admin" | "viewer";

export type OnboardingStep =
  | "profile"
  | "channels"
  | "knowledge"
  | "catalog"
  | "test"
  | "widget"
  | "complete";

export type ChannelType = "whatsapp" | "messenger" | "instagram" | "web";

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  timestamp: string;
}

export interface User {
  userId: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  mfaEnabled: boolean;
}

export interface Tenant {
  tenantId: string;
  storeName: string;
  plan: string;
  status: string;
  timezone: string;
  onboardingStep: OnboardingStep;
  logoUrl?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  user: User;
  tenant: Tenant;
}

export interface TenantConfig {
  llmConfig: {
    primaryProvider: string;
    models: { faq: string; product: string; checkout: string };
  };
  prompts: {
    systemPrompt: string;
    greeting: string;
    handoffMessage: string;
  };
  enabledChannels: ChannelType[];
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
}

export interface PlanLimits {
  maxMessages: number;
  maxSources: number;
  maxVectors: number;
  maxTeamMembers: number;
  enabledChannels: ChannelType[];
}

export interface Usage {
  period: string;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  ingestJobs: number;
  estimatedLlmCostUsd: number;
  limits: { maxMessages: number; messagesRemaining: number };
}

export interface ChannelInfo {
  channel: ChannelType;
  status: "connected" | "disconnected";
  displayPhone?: string;
  pageName?: string;
  connectedAt?: string;
  widgetEnabled?: boolean;
}

export interface Conversation {
  conversationId: string;
  channel: ChannelType;
  externalUserId: string;
  customerName?: string;
  status: string;
  messageCount: number;
  lastInboundAt: string;
  updatedAt: string;
}

export interface Message {
  messageId: string;
  direction: "inbound" | "outbound";
  role: "user" | "assistant";
  type: string;
  content: string;
  createdAt: string;
  metadata?: {
    llmModel?: string;
    toolCalls?: string[];
  };
}

export interface KnowledgeSource {
  sourceId: string;
  type: string;
  name: string;
  status: string;
  chunkCount: number;
  vectorCount: number;
  lastSyncAt?: string;
}

export interface IngestJob {
  jobId: string;
  sourceId: string;
  type: string;
  status: string;
  stats?: {
    pagesProcessed: number;
    chunksCreated: number;
    durationSec: number;
  };
  completedAt?: string;
  error?: string;
}

export interface TeamMember {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  status: string;
  lastLoginAt?: string;
}

export interface OnboardingState {
  currentStep: OnboardingStep;
  steps: Array<{
    step: OnboardingStep;
    status: "completed" | "in_progress" | "pending";
    completedAt?: string;
    metadata?: Record<string, unknown>;
  }>;
  canSkip: OnboardingStep[];
}

export interface DashboardStats {
  messagesToday: number;
  messagesThisMonth: number;
  activeConversations: number;
  ordersInfluenced: number;
  channelHealth: Record<string, string>;
  quotaPercent: number;
}

export interface CartItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface ConversationDetail extends Conversation {
  cart?: { items: CartItem[]; subtotal: number; currency: string };
}
