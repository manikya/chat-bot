import { getConversationAnalytics, loadConfig } from "@commercechat/core";
import { createHandler } from "../lib/handler";

export const handler = createHandler(
  async (event, auth) => {
    const params = event.queryStringParameters ?? {};
    return getConversationAnalytics(
      auth!,
      {
        from: params.from,
        to: params.to,
      },
      loadConfig()
    );
  },
  { requireAuth: true }
);
