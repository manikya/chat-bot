import type {
  ChannelInfo,
  Conversation,
  ConversationDetail,
  ConversationAnalytics,
  DashboardStats,
  IngestJob,
  KnowledgeSource,
  LoginResult,
  Message,
  OnboardingState,
  PlanLimits,
  TeamMember,
  Tenant,
  TenantConfig,
  Usage,
  User,
} from "../types";

export const DEMO_USER: User = {
  userId: "usr_def456",
  tenantId: "ten_abc123",
  email: "owner@store.com",
  name: "Jane Owner",
  role: "owner",
  emailVerified: true,
  mfaEnabled: false,
};

export const DEMO_TENANT: Tenant = {
  tenantId: "ten_abc123",
  storeName: "Acme Shoes",
  plan: "trial",
  status: "trial",
  timezone: "America/New_York",
  onboardingStep: "complete",
  logoUrl: undefined,
};

export const NEW_USER_TENANT: Tenant = {
  ...DEMO_TENANT,
  tenantId: "ten_new001",
  storeName: "New Store",
  onboardingStep: "profile",
};

export const DEMO_CONFIG: TenantConfig = {
  llmConfig: {
    primaryProvider: "openai",
    models: {
      faq: "gpt-4o-mini",
      product: "gpt-4o-mini",
      checkout: "gpt-4o-mini",
    },
  },
  prompts: {
    systemPrompt:
      "You are Acme Shoes' AI shopping assistant. Help customers find products and complete purchases.",
    greeting: "Hi! How can I help you shop today?",
    handoffMessage: "Let me connect you with our team.",
  },
  enabledChannels: ["whatsapp", "web"],
  commerceConnector: {
    type: "manual",
    status: "connected",
    checkoutBaseUrl: "https://acme-shoes.com/checkout",
  },
  widgetConfig: {
    primaryColor: "#4F46E5",
    position: "bottom-right",
    suggestedQuestions: ["Shipping info", "Best sellers", "Return policy"],
  },
  featureFlags: {
    manualRepliesOnly: false,
  },
};

export const DEMO_LIMITS: PlanLimits = {
  maxMessages: 2000,
  maxSources: 3,
  maxVectors: 10000,
  maxTeamMembers: 3,
  enabledChannels: ["whatsapp", "web"],
};

export const DEMO_USAGE: Usage = {
  period: "2026-06",
  messages: 342,
  inputTokens: 890000,
  outputTokens: 120000,
  ingestJobs: 4,
  estimatedLlmCostUsd: 4.52,
  limits: { maxMessages: 2000, messagesRemaining: 1658 },
};

export const DEMO_CHANNELS: ChannelInfo[] = [
  {
    channel: "whatsapp",
    status: "connected",
    displayPhone: "+1 555 123 4567",
    connectedAt: "2026-06-07T14:00:00Z",
  },
  { channel: "messenger", status: "disconnected" },
  { channel: "instagram", status: "disconnected" },
  { channel: "web", status: "connected", widgetEnabled: true },
];

export const DEMO_CONVERSATIONS: Conversation[] = [
  {
    conversationId: "conv_jkl012",
    channel: "whatsapp",
    externalUserId: "919876543210",
    customerName: "Priya",
    status: "active",
    handlingMode: "bot",
    funnelStage: "cart",
    lastIntent: "checkout",
    lastSubIntent: "cart_review",
    messageCount: 8,
    lastInboundAt: "2026-06-10T09:15:00Z",
    updatedAt: "2026-06-10T09:15:08Z",
    cart: {
      itemCount: 1,
      subtotal: 89.99,
      currency: "USD",
      updatedAt: "2026-06-10T09:15:08Z",
      firstItemName: "Blue Runner Sneaker",
      abandoned: true,
      checkoutUrl: "https://acme-shoes.com/checkout/order-pay/123/?pay_for_order=true&key=wc_order_demo",
      checkoutProvider: "woocommerce",
      checkoutExternalId: "123",
      checkoutCreatedAt: "2026-06-10T09:16:08Z",
    },
  },
  {
    conversationId: "conv_web_xyz",
    channel: "web",
    externalUserId: "web_sess_abc",
    customerName: "Visitor #4821",
    status: "active",
    handlingMode: "bot",
    funnelStage: "discover",
    lastIntent: "faq",
    messageCount: 4,
    lastInboundAt: "2026-06-10T08:42:00Z",
    updatedAt: "2026-06-10T08:42:15Z",
  },
  {
    conversationId: "conv_wa_002",
    channel: "whatsapp",
    externalUserId: "447700900123",
    customerName: "James",
    status: "active",
    handlingMode: "human",
    funnelStage: "compare",
    lastIntent: "product",
    messageCount: 12,
    lastInboundAt: "2026-06-09T16:30:00Z",
    updatedAt: "2026-06-09T16:31:02Z",
  },
];

export const DEMO_MESSAGES: Record<string, Message[]> = {
  conv_jkl012: [
    {
      messageId: "msg_001",
      direction: "outbound",
      role: "assistant",
      type: "text",
      content: "Hi! How can I help you shop today?",
      createdAt: "2026-06-10T09:10:00Z",
    },
    {
      messageId: "msg_002",
      direction: "inbound",
      role: "user",
      type: "text",
      content: "Do you have blue sneakers size 9?",
      createdAt: "2026-06-10T09:15:00Z",
    },
    {
      messageId: "msg_003",
      direction: "outbound",
      role: "assistant",
      type: "text",
      content:
        "Yes! I found 3 blue sneakers in size 9. Our top pick is the Blue Runner at $89.99. Would you like to add it to your cart?",
      createdAt: "2026-06-10T09:15:08Z",
      metadata: { llmModel: "gpt-4o-mini", toolCalls: ["search_products"] },
    },
  ],
  conv_web_xyz: [
    {
      messageId: "msg_w01",
      direction: "inbound",
      role: "user",
      type: "text",
      content: "What's your return policy?",
      createdAt: "2026-06-10T08:42:00Z",
    },
    {
      messageId: "msg_w02",
      direction: "outbound",
      role: "assistant",
      type: "text",
      content: "We offer 30-day free returns on all unworn items with original packaging.",
      createdAt: "2026-06-10T08:42:15Z",
      metadata: { llmModel: "gpt-4o-mini", toolCalls: [] },
    },
  ],
};

export const DEMO_CONVERSATION_DETAILS: Record<string, ConversationDetail> = {
  conv_jkl012: {
    ...DEMO_CONVERSATIONS[0],
    cart: {
      itemCount: 1,
      items: [
        {
          sku: "SHOE-BLU-9",
          name: "Blue Runner Sneaker",
          quantity: 1,
          unitPrice: 89.99,
        },
      ],
      subtotal: 89.99,
      currency: "USD",
      updatedAt: "2026-06-10T09:15:08Z",
      firstItemName: "Blue Runner Sneaker",
      abandoned: true,
      checkoutUrl: "https://acme-shoes.com/checkout/order-pay/123/?pay_for_order=true&key=wc_order_demo",
      checkoutProvider: "woocommerce",
      checkoutExternalId: "123",
      checkoutCreatedAt: "2026-06-10T09:16:08Z",
    },
  },
};

export const DEMO_SOURCES: KnowledgeSource[] = [
  {
    sourceId: "src_vwx234",
    type: "website",
    name: "Main website",
    status: "active",
    chunkCount: 142,
    vectorCount: 387,
    lastSyncAt: "2026-06-08T02:00:00Z",
  },
  {
    sourceId: "src_cat001",
    type: "catalog",
    name: "Product catalog",
    status: "active",
    chunkCount: 56,
    vectorCount: 56,
    lastSyncAt: "2026-06-07T16:00:00Z",
  },
  {
    sourceId: "src_faq001",
    type: "faq",
    name: "FAQ",
    status: "active",
    chunkCount: 12,
    vectorCount: 12,
    lastSyncAt: "2026-06-06T12:00:00Z",
  },
];

export const DEMO_JOBS: IngestJob[] = [
  {
    jobId: "job_wp001",
    sourceId: "src_woo001",
    type: "woocommerce_sync",
    status: "completed",
    stats: { pagesProcessed: 248, chunksCreated: 248, tokensEmbedded: 18420, durationSec: 94 },
    completedAt: "2026-06-14T15:05:00Z",
  },
  {
    jobId: "job_yza567",
    sourceId: "src_vwx234",
    type: "website_sync",
    status: "completed",
    stats: { pagesProcessed: 142, chunksCreated: 387, durationSec: 89 },
    completedAt: "2026-06-08T02:01:30Z",
  },
  {
    jobId: "job_run001",
    sourceId: "src_vwx234",
    type: "website_sync",
    status: "running",
    stats: { pagesProcessed: 45, chunksCreated: 120, durationSec: 32 },
  },
];

export const DEMO_TEAM: TeamMember[] = [
  {
    userId: "usr_def456",
    email: "owner@store.com",
    name: "Jane Owner",
    role: "owner",
    status: "active",
    lastLoginAt: "2026-06-10T08:30:00Z",
  },
  {
    userId: "usr_admin01",
    email: "admin@store.com",
    name: "Alex Admin",
    role: "admin",
    status: "active",
    lastLoginAt: "2026-06-09T14:00:00Z",
  },
];

export const DEMO_DASHBOARD: DashboardStats = {
  messagesToday: 28,
  messagesThisMonth: 342,
  activeConversations: 5,
  ordersInfluenced: 12,
  channelHealth: {
    whatsapp: "healthy",
    web: "healthy",
    messenger: "disconnected",
    instagram: "disconnected",
  },
  quotaPercent: 17,
};

export const DEMO_ANALYTICS: ConversationAnalytics = {
  from: "2026-05-10",
  to: "2026-06-08",
  summary: {
    messagesTotal: 342,
    conversationsTotal: 89,
    conversationsActive: 5,
    cartsStarted: 24,
    checkoutLinks: 11,
  },
  messagesByDay: [
    { date: "2026-06-02", messages: 12 },
    { date: "2026-06-03", messages: 18 },
    { date: "2026-06-04", messages: 9 },
    { date: "2026-06-05", messages: 22 },
    { date: "2026-06-06", messages: 15 },
    { date: "2026-06-07", messages: 28 },
    { date: "2026-06-08", messages: 28 },
  ],
  channelBreakdown: [
    { channel: "web", count: 198 },
    { channel: "whatsapp", count: 112 },
    { channel: "messenger", count: 32 },
  ],
  intentBreakdown: [
    { intent: "product_search", count: 94 },
    { intent: "order_status", count: 41 },
    { intent: "faq", count: 38 },
    { intent: "checkout", count: 22 },
  ],
  topProducts: [
    { label: "blue running shoes", count: 18 },
    { label: "wireless earbuds", count: 14 },
    { label: "gift card", count: 9 },
  ],
  funnel: {
    conversations: 89,
    withCart: 24,
    checkoutLinks: 11,
  },
};

export const DEMO_ONBOARDING: OnboardingState = {
  currentStep: "knowledge",
  steps: [
    { step: "profile", status: "completed", completedAt: "2026-06-06T10:30:00Z" },
    {
      step: "channels",
      status: "completed",
      completedAt: "2026-06-06T10:45:00Z",
      metadata: { whatsappConnected: true },
    },
    {
      step: "knowledge",
      status: "in_progress",
      metadata: { sourceId: "src_vwx234", jobStatus: "running" },
    },
    { step: "catalog", status: "pending" },
    { step: "test", status: "pending" },
    { step: "widget", status: "pending" },
  ],
  canSkip: ["channels", "catalog"],
};

export const DEMO_LOGIN: LoginResult = {
  accessToken: "mock_access_token_demo",
  refreshToken: "mock_refresh_token_demo",
  expiresIn: 3600,
  tokenType: "Bearer",
  user: DEMO_USER,
  tenant: DEMO_TENANT,
};

export const WIDGET_EMBED = `<script
  src="https://cdn.commercechat.com/widget/v1.js"
  data-api-key="pk_live_abc123demo"
  async
></script>`;

export const MOCK_TEST_REPLIES = [
  "We offer free shipping on orders over $50 within the US.",
  "Our best sellers this week are the Blue Runner and Classic Leather Boot.",
  "Yes! I found 3 blue sneakers in size 9 starting at $89.99.",
];
