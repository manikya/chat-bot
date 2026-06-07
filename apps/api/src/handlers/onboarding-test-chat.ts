import { onboardingTestChat, loadConfig } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const { message } = parseBody<{ message: string }>(event);
    return onboardingTestChat(auth!, message, loadConfig());
  },
  { requireAuth: true }
);
