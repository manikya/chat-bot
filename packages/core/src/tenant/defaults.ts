import type { PlanLimits, TenantConfig } from "@commercechat/shared";

export function defaultTenantConfig(storeName: string): TenantConfig {
  return {
    llmConfig: {
      primaryProvider: "openai",
      models: { faq: "gpt-4o-mini", product: "gpt-4o-mini", checkout: "gpt-4o-mini" },
      embeddingModel: "text-embedding-3-small",
    },
    prompts: {
      systemPrompt: `You are ${storeName}'s AI shopping assistant. Help customers find products and complete purchases.`,
      greeting: "Hi! How can I help you shop today?",
      handoffMessage: "Let me connect you with our team.",
    },
    enabledChannels: ["web"],
    commerceConnector: { type: "manual", status: "connected", checkoutBaseUrl: "" },
    widgetConfig: {
      primaryColor: "#4F46E5",
      position: "bottom-right",
      suggestedQuestions: ["Shipping info", "Best sellers", "Return policy"],
    },
    featureFlags: {
      conversationIngest: false,
      socialIngest: false,
      humanHandoff: false,
      mfaAvailable: false,
    },
  };
}

export function defaultPlanLimits(): PlanLimits {
  return {
    maxMessages: 2000,
    maxSources: 3,
    maxVectors: 10000,
    maxTeamMembers: 5,
    enabledChannels: ["web", "whatsapp", "messenger", "instagram"],
  };
}
