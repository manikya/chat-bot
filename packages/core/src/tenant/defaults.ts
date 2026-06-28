import type { PlanLimits, TenantConfig } from "@commercechat/shared";
import {
  defaultSuggestedQuestions,
  lkDefaultGreeting,
  lkDefaultSystemPrompt,
  marketFromTimezone,
} from "../chat/locale";

export function defaultTenantConfig(storeName: string, options?: { timezone?: string }): TenantConfig {
  const market = marketFromTimezone(options?.timezone);
  const isLk = market === "lk";

  return {
    llmConfig: {
      primaryProvider: "openai",
      models: { faq: "gpt-4o-mini", product: "gpt-4o-mini", checkout: "gpt-4o-mini" },
      embeddingModel: "text-embedding-3-small",
    },
    prompts: {
      systemPrompt: isLk ? lkDefaultSystemPrompt(storeName) : `You are ${storeName}'s AI shopping assistant. Help customers find products and complete purchases.`,
      greeting: isLk
        ? lkDefaultGreeting(storeName)
        : "Hi! How can I help you shop today?",
      handoffMessage: isLk
        ? "Let me connect you with our team. / අපේ කණ්ඩායම සම්බන්ධ කරන්නම්."
        : "Let me connect you with our team.",
    },
    enabledChannels: ["web"],
    commerceConnector: {
      type: "manual",
      status: "connected",
      checkoutBaseUrl: "",
      ...(isLk ? { currency: "LKR" } : {}),
    },
    widgetConfig: {
      primaryColor: "#4F46E5",
      position: "bottom-right",
      suggestedQuestions: defaultSuggestedQuestions(market),
      widgetEnabled: true,
    },
    featureFlags: {
      conversationIngest: false,
      socialIngest: false,
      humanHandoff: false,
      manualRepliesOnly: false,
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
