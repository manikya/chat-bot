import { regenerateWidgetApiKey, loadConfig } from "@commercechat/core";
import { createHandler } from "../lib/handler";

export const handler = createHandler(
  async (_event, auth) => regenerateWidgetApiKey(auth!, loadConfig()),
  { requireAuth: true, minRole: "admin" }
);
