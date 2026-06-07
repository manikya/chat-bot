import { getDashboardStats, loadConfig } from "@commercechat/core";
import { createHandler } from "../lib/handler";

export const handler = createHandler(
  async (_event, auth) => getDashboardStats(auth!, loadConfig()),
  { requireAuth: true }
);
