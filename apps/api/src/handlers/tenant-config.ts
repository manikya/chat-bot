import { getTenantConfig, updateTenantConfig, loadConfig } from "@commercechat/core";
import type { TenantConfig } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const config = loadConfig();
    if (event.requestContext.http.method === "GET") {
      return getTenantConfig(auth!, config);
    }
    const patch = parseBody<Partial<TenantConfig>>(event);
    return updateTenantConfig(auth!, patch, config);
  },
  { requireAuth: true }
);
