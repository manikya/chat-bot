import { processChat, loadConfig, type ChatRequestBody } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const body = parseBody<ChatRequestBody>(event);
    return processChat(auth!, body, loadConfig());
  },
  { requireAuth: true }
);
