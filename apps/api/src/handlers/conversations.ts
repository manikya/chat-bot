import {
  getConversationDetail,
  getConversationMessages,
  listConversations,
  loadConfig,
} from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { pathParam, queryParam } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const config = loadConfig();
    const method = event.requestContext.http.method;
    const conversationId = pathParam(event, "conversationId");

    if (method === "GET" && !conversationId) {
      const limit = queryParam(event, "limit");
      return listConversations(
        auth!,
        {
          channel: queryParam(event, "channel"),
          status: queryParam(event, "status"),
          cursor: queryParam(event, "cursor"),
          limit: limit ? Number(limit) : undefined,
        },
        config
      );
    }

    if (method === "GET" && conversationId && event.rawPath.endsWith("/messages")) {
      const limit = queryParam(event, "limit");
      const order = queryParam(event, "order") as "asc" | "desc" | undefined;
      return getConversationMessages(
        auth!,
        conversationId,
        { limit: limit ? Number(limit) : undefined, order },
        config
      );
    }

    if (method === "GET" && conversationId) {
      return getConversationDetail(auth!, conversationId, config);
    }

    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Unsupported request", 400);
  },
  { requireAuth: true }
);
