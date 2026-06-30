export type UserRole = "owner" | "admin" | "viewer";
export type PlatformUserRole = "owner" | "admin" | "support";
export type PlatformUserStatus = "active" | "disabled";

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

export interface PlatformUser {
  userId: string;
  email: string;
  name: string;
  role: PlatformUserRole;
  status: PlatformUserStatus;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
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
    /** Optional lower-latency model used only for runtime sales planning. */
    plannerModel?: string;
    /** Higher-quality model used for offline/admin catalog intelligence generation. */
    catalogIntelligenceModel?: string;
    /** Higher-quality model used when a reply is high-risk or a quality retry is needed. */
    escalationModel?: string;
    embeddingModel: string;
    /** LLM sampling temperature (0–1). Default 0.4 when unset. */
    temperature?: number;
    /** Max tokens in assistant reply. Default 800 when unset. */
    maxOutputTokens?: number;
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
    /** When false, widget is hidden and Shopify ScriptTag is removed. Default true. */
    widgetEnabled?: boolean;
  };
  featureFlags: Record<string, boolean> & {
    manualRepliesOnly?: boolean;
    prepaidAiEnabled?: boolean;
    prepaidAiPaused?: boolean;
  };
}

export interface PlanLimits {
  maxMessages: number;
  maxSources: number;
  maxVectors: number;
  maxTeamMembers: number;
  enabledChannels: string[];
}

export interface AiWallet {
  tenantId: string;
  currency: "LKR" | "USD" | string;
  balanceMinor: number;
  status: "inactive" | "active" | "low" | "empty";
  lowBalanceThresholdMinor: number;
  prepaidAiEnabled: boolean;
  lowBalanceNotifiedAt?: string;
  emptyBalanceNotifiedAt?: string;
  updatedAt: string;
}

export interface AiWalletLedgerEntry {
  id: string;
  tenantId: string;
  type: "credit" | "debit" | "adjustment";
  amountMinor: number;
  currency: string;
  reason: "topup" | "chat_turn" | "manual_adjustment" | "test_chat";
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  conversationId?: string;
  balanceAfterMinor?: number;
  idempotencyKey?: string;
  createdAt: string;
}

export interface AiWalletOverview {
  wallet: AiWallet;
  ledger: AiWalletLedgerEntry[];
}

export interface PlatformTenantSummary {
  tenantId: string;
  storeName: string;
  ownerEmail: string;
  plan: TenantPlan | string;
  status: TenantStatus | string;
  timezone?: string;
  websiteUrl?: string;
  onboardingStep?: OnboardingStep | string;
  logoUrl?: string;
  widgetApiKeyPrefix?: string;
  createdAt?: string;
  updatedAt?: string;
  billingPeriodEnd?: string;
  trialEndsAt?: string;
  cancelAtPeriodEnd?: boolean;
  usage: {
    period: string;
    messages: number;
    inputTokens: number;
    outputTokens: number;
    ingestJobs: number;
    maxMessages: number;
  };
  aiWallet?: AiWallet;
}

export interface PlatformTenantDetail extends PlatformTenantSummary {
  config?: TenantConfig;
  limits?: PlanLimits;
}

export interface PlatformTenantList {
  items: PlatformTenantSummary[];
  total: number;
  nextCursor?: string;
}

export interface PlatformUserList {
  items: PlatformUser[];
}

export interface SocialContentIdea {
  id: string;
  title: string;
  captionIdea: string;
  productAngle: string;
  suggestedFormat: "reel" | "story" | "carousel" | "post" | "short" | string;
  hashtags: string[];
  whyToday: string;
}

export interface DailySocialContent {
  tenantId: string;
  date: string;
  timezone: string;
  generatedAt: string;
  source: "ai" | "deterministic";
  storeName?: string;
  summary: string;
  ideas: SocialContentIdea[];
  signals: {
    products: string[];
    categories: string[];
    tags: string[];
    starterIntents: string[];
  };
}

export type MobileAiSnapshotStatus = "not_synced" | "syncing" | "ready" | "stale" | "error";

export type MobileAiModelStatus =
  | "not_downloaded"
  | "download_pending"
  | "downloading"
  | "paused"
  | "ready"
  | "removing"
  | "error";

export type MobileAiReplyMode = "draft" | "auto";

export type MobileAiSourceType =
  | "catalog"
  | "faq"
  | "website"
  | "page_voice"
  | "conversation"
  | "policy"
  | "unknown";

export interface MobileAiSnapshotManifest {
  tenantId: string;
  snapshotId: string;
  version: number;
  generatedAt: string;
  expiresAt: string;
  embeddingModel: string;
  embeddingDimensions: number;
  chunkCount: number;
  deletedChunkIds?: string[];
  checksum: string;
  downloadUrl?: string;
  deltaUrl?: string;
  volatileFields: Array<"price" | "inStock" | "availability" | "checkoutUrl">;
}

export interface MobileAiSnapshotChunk {
  id: string;
  sourceId: string;
  sourceType: MobileAiSourceType;
  text: string;
  embedding: number[];
  version: number;
  updatedAt: string;
  deleted?: boolean;
  metadata: {
    title?: string;
    section?: string;
    url?: string;
    sku?: string;
    categories?: string[];
    price?: number;
    currency?: string;
    inStock?: boolean;
    tags?: string[];
    material?: string[];
    occasion?: string[];
    recipient?: string[];
    question?: string;
  };
}

export interface MobileAiSnapshotDelta {
  tenantId: string;
  fromVersion?: number;
  toVersion: number;
  generatedAt: string;
  chunks: MobileAiSnapshotChunk[];
  deletedChunkIds: string[];
}

export interface MobileAiSyncState {
  status: MobileAiSnapshotStatus;
  tenantId?: string;
  snapshotId?: string;
  version?: number;
  chunkCount?: number;
  lastSyncedAt?: string;
  expiresAt?: string;
  errorMessage?: string;
}

export interface MobileAiDevicePreferences {
  allowLlmDownload: boolean;
  allowVectorSync: boolean;
  replyMode: MobileAiReplyMode;
  modelStatus: MobileAiModelStatus;
  modelId?: string;
  modelVersion?: string;
  modelDisplayName?: string;
  modelDownloadUrl?: string;
  modelLocalUri?: string;
  modelSizeBytes?: number;
  modelDownloadedBytes?: number;
  modelDownloadProgressPct?: number;
  modelResumeData?: string;
  modelAvailableVersion?: string;
  modelChecksum?: string;
  modelDownloadedAt?: string;
  modelErrorMessage?: string;
}

export interface MobileAiLocalReply {
  reply: string;
  confidence: number;
  needsCloud: boolean;
  usedChunkIds: string[];
  riskFlags: string[];
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

/** Sales-funnel stage on a shopper conversation (Phase 2+). */
export type FunnelStage = "discover" | "compare" | "objection" | "cart" | "checkout";

/** Known shopper preferences gathered during discover/compare (Phase 2+). */
export interface QualificationState {
  budget?: { min?: number; max?: number };
  category?: string;
  recipient?: string;
  quantity?: number;
  constraints?: string[];
  removeConstraints?: string[];
  objectionsRaised?: string[];
  lastComparedSkus?: string[];
}

/** Finer routing label; does not replace ChatIntent for model selection (Phase 3). */
export type ChatSubIntent =
  | "product_browse"
  | "product_compare"
  | "product_detail"
  | "faq_policy"
  | "faq_objection"
  | "cart_review"
  | "checkout_ready"
  | "order_status";

/** Who replies to the customer — bot automation or a human agent (admin / future mobile app). */
export type ConversationHandlingMode = "bot" | "human";

export type WidgetActionType = "product" | "checkout" | "message";

export interface WidgetAction {
  type: WidgetActionType;
  label: string;
  sku?: string;
  action?: "view" | "add_to_cart" | "checkout";
  message?: string;
}

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
  retrievedChunks?: Array<{
    sourceType?: string;
    sourceId?: string;
    chunkId?: string;
    title?: string;
    section?: string;
    sku?: string;
    score: number;
    textPreview: string;
  }>;
  intent?: ChatIntent;
  funnelStage?: FunnelStage;
  subIntent?: ChatSubIntent;
  suggestedActions?: WidgetAction[];
  salesPlan?: Record<string, unknown> | null;
  agentTrace?: Record<string, unknown> | null;
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
  scope?: "tenant" | "platform";
  platformRole?: PlatformUserRole;
}
