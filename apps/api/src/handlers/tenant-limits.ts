import { getTenantLimits, loadConfig } from "@commercechat/core";
import { createHandler } from "../lib/handler";

export const handler = createHandler(
  async (_event, auth) => getTenantLimits(auth!, loadConfig()),
  { requireAuth: true }
);
