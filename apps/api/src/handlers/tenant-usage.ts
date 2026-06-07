import { getTenantUsage, loadConfig } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { queryParam } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const period = queryParam(event, "period");
    return getTenantUsage(auth!, period, loadConfig());
  },
  { requireAuth: true }
);
