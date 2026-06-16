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
  websiteUrl?: string;
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

export type TenantPlan = "trial" | "starter" | "pro" | "business" | "enterprise";

export interface BillingPlan {
  id: TenantPlan;
  name: string;
  description: string;
  priceLkr: number;
  priceUsd: number;
  interval: "month";
  trialDays?: number;
  limits: PlanLimits;
  features: string[];
  highlighted?: boolean;
  contactSales?: boolean;
}

export interface BillingSubscription {
  plan: TenantPlan;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingPeriodStart: string | null;
  trialDaysRemaining: number | null;
}

export interface BillingPlanDetails {
  name: string;
  features: string[];
  priceLkr: number;
  priceUsd: number;
}

export interface BillingCheckoutSession {
  checkoutId: string;
  plan: TenantPlan;
  amountLkr: number;
  currency: "LKR";
  status: "pending" | "paid" | "failed";
  redirectUrl: string | null;
  gateway: string;
  message?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface BillingOverview {
  subscription: BillingSubscription;
  usage: Omit<Usage, "limits">;
  limits: PlanLimits;
  resources: {
    sources: number;
    teamMembers: number;
    vectors: number;
    messagesRemaining: number;
  };
  utilization: {
    messagesPct: number;
    sourcesPct: number;
    teamPct: number;
    vectorsPct: number;
  };
  planDetails: BillingPlanDetails | null;
}

export interface ChannelInfo {
  channel: ChannelType;
  status: "connected" | "disconnected";
  displayPhone?: string;
  pageName?: string;
  pageId?: string;
  connectedAt?: string;
  widgetEnabled?: boolean;
}

export interface Conversation {
  conversationId: string;
  channel: ChannelType;
  externalUserId: string;
  customerName?: string;
  status: string;
  handlingMode?: "bot" | "human";
  funnelStage?: "discover" | "compare" | "objection" | "cart" | "checkout";
  lastIntent?: "faq" | "product" | "checkout" | "greeting" | "unknown";
  lastSubIntent?: string;
  assignedToUserId?: string | null;
  manualReplySupported?: boolean;
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
    intent?: string;
    subIntent?: string;
    funnelStage?: string;
    manual?: boolean;
    handoff?: boolean;
    sentByUserId?: string;
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
  estimatedMinutesRemaining?: number;
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

export interface ConversationAnalytics {
  from: string;
  to: string;
  summary: {
    messagesTotal: number;
    conversationsTotal: number;
    conversationsActive: number;
    cartsStarted: number;
    checkoutLinks: number;
  };
  messagesByDay: Array<{ date: string; messages: number }>;
  channelBreakdown: Array<{ channel: string; count: number }>;
  intentBreakdown: Array<{ intent: string; count: number }>;
  funnelStageBreakdown?: Array<{ stage: string; count: number }>;
  subIntentBreakdown?: Array<{ subIntent: string; count: number }>;
  topProducts: Array<{ label: string; count: number }>;
  funnel: {
    conversations: number;
    withCart: number;
    checkoutLinks: number;
  };
}

export interface CartItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface ConversationDetail extends Conversation {
  qualification?: {
    budget?: { min?: number; max?: number };
    category?: string;
    recipient?: string;
    constraints?: string[];
    objectionsRaised?: string[];
  };
  cart?: { items: CartItem[]; subtotal: number; currency: string };
}
