import { getOnboardingState, advanceOnboardingStep, loadConfig } from "@commercechat/core";
import type { OnboardingStep } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const config = loadConfig();
    if (event.requestContext.http.method === "GET") {
      return getOnboardingState(auth!, config);
    }
    const body = parseBody<{ step: OnboardingStep; skipped?: boolean; skippedSteps?: OnboardingStep[] }>(
      event
    );
    return advanceOnboardingStep(auth!, body, config);
  },
  { requireAuth: true }
);
