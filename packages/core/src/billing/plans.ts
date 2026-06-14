import type { PlanLimits, TenantPlan } from "@commercechat/shared";

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

const TRIAL_LIMITS: PlanLimits = {
  maxMessages: 2_000,
  maxSources: 3,
  maxVectors: 10_000,
  maxTeamMembers: 5,
  enabledChannels: ["web", "whatsapp", "instagram", "messenger"],
};

const STARTER_LIMITS: PlanLimits = {
  maxMessages: 2_000,
  maxSources: 3,
  maxVectors: 10_000,
  maxTeamMembers: 1,
  enabledChannels: ["web", "whatsapp"],
};

const PRO_LIMITS: PlanLimits = {
  maxMessages: 10_000,
  maxSources: 10,
  maxVectors: 50_000,
  maxTeamMembers: 5,
  enabledChannels: ["web", "whatsapp", "instagram", "messenger"],
};

const BUSINESS_LIMITS: PlanLimits = {
  maxMessages: 50_000,
  maxSources: 999,
  maxVectors: 500_000,
  maxTeamMembers: 20,
  enabledChannels: ["web", "whatsapp", "instagram", "messenger"],
};

export const PLAN_ORDER: TenantPlan[] = ["trial", "starter", "pro", "business", "enterprise"];

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "trial",
    name: "Trial",
    description: "Evaluate CommerceChat with full channel access during onboarding.",
    priceLkr: 0,
    priceUsd: 0,
    interval: "month",
    trialDays: 14,
    limits: TRIAL_LIMITS,
    features: [
      "2,000 messages / month",
      "All channels during trial",
      "3 knowledge sources",
      "10,000 vectors",
      "Up to 5 team members",
      "14-day free trial",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    description: "For small shops getting started with AI-assisted sales.",
    priceLkr: 14_900,
    priceUsd: 49,
    interval: "month",
    limits: STARTER_LIMITS,
    features: [
      "2,000 messages / month",
      "1 WhatsApp + web widget",
      "3 knowledge sources",
      "1 team member",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Growing brands with more volume and channels.",
    priceLkr: 44_900,
    priceUsd: 149,
    interval: "month",
    limits: PRO_LIMITS,
    highlighted: true,
    features: [
      "10,000 messages / month",
      "All Meta channels + web",
      "10 knowledge sources",
      "5 team members",
      "Conversation export",
    ],
  },
  {
    id: "business",
    name: "Business",
    description: "High-volume merchants with larger teams.",
    priceLkr: 119_900,
    priceUsd: 399,
    interval: "month",
    limits: BUSINESS_LIMITS,
    features: [
      "50,000 messages / month",
      "Unlimited sources",
      "500K vectors",
      "20 team members",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Custom limits, SLAs, and dedicated onboarding.",
    priceLkr: 0,
    priceUsd: 0,
    interval: "month",
    limits: BUSINESS_LIMITS,
    contactSales: true,
    features: ["Custom message quotas", "Dedicated support", "Custom contracts", "Volume pricing"],
  },
];

export function getBillingPlan(planId: TenantPlan): BillingPlan | undefined {
  return BILLING_PLANS.find((p) => p.id === planId);
}

export function planTierIndex(plan: TenantPlan): number {
  const idx = PLAN_ORDER.indexOf(plan);
  return idx === -1 ? 0 : idx;
}

export function isPlanUpgrade(from: TenantPlan, to: TenantPlan): boolean {
  return planTierIndex(to) > planTierIndex(from);
}
