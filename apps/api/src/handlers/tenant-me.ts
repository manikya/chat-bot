import { getTenantProfile, updateTenantProfile } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";
import { loadConfig } from "@commercechat/core";

export const handler = createHandler(
  async (event, auth) => {
    const config = loadConfig();
    if (event.requestContext.http.method === "GET") {
      return getTenantProfile(auth!, config);
    }
    const patch = parseBody<{ storeName?: string; timezone?: string; websiteUrl?: string; onboardingStep?: string }>(event);
    return updateTenantProfile(auth!, patch, config);
  },
  { requireAuth: true }
);
