import { getPlatformMe, loadConfig, platformLogin } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const loginHandler = createHandler(async (event) => {
  const body = parseBody<{ email: string; password: string }>(event);
  return platformLogin(body, loadConfig());
});

export const meHandler = createHandler(
  async (_event, auth) => getPlatformMe(auth!, loadConfig()),
  { requireAuth: true }
);
