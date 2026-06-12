import type { OnboardingStep } from "@commercechat/shared";

export const ONBOARDING_STEP_ORDER: OnboardingStep[] = [
  "profile",
  "channels",
  "knowledge",
  "catalog",
  "test",
  "widget",
  "complete",
];

export const WIZARD_STEPS: OnboardingStep[] = [
  "profile",
  "channels",
  "knowledge",
  "catalog",
  "test",
  "widget",
];

export const SKIPPABLE_STEPS: OnboardingStep[] = ["channels", "knowledge", "catalog"];

export const STEP_ESTIMATE_MINUTES: Record<OnboardingStep, number> = {
  profile: 2,
  channels: 3,
  knowledge: 5,
  catalog: 2,
  test: 2,
  widget: 2,
  complete: 0,
};
