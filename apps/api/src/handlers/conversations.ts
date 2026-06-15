import {
  getConversationDetail,
  getConversationMessages,
  listConversations,
  loadConfig,
  sendManualConversationReply,
  updateConversationHandling,
} from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { pathParam, queryParam } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const config = loadConfig();
    const method = event.requestContext.http.method;
    const conversationId = pathParam(event, "conversationId");
    const path = event.rawPath;

    if (method === "GET" && !conversationId) {
      const limit = queryParam(event, "limit");
      const handlingMode = queryParam(event, "handlingMode");
      return listConversations(
        auth!,
        {
          channel: queryParam(event, "channel"),
          status: queryParam(event, "status"),
          handlingMode:
            handlingMode === "human" || handlingMode === "bot" ? handlingMode : undefined,
          cursor: queryParam(event, "cursor"),
          limit: limit ? Number(limit) : undefined,
        },
        config
      );
    }

    if (method === "GET" && conversationId && path.endsWith("/messages")) {
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

    if (method === "PATCH" && conversationId && path.endsWith("/handling")) {
      const body = JSON.parse(event.body || "{}") as {
        mode?: string;
        notifyCustomer?: boolean;
        assignedToUserId?: string | null;
      };
      if (body.mode !== "bot" && body.mode !== "human") {
        throw new ApiError(ErrorCodes.VALIDATION_ERROR, "mode must be bot or human", 400);
      }
      return updateConversationHandling(
        auth!,
        conversationId,
        {
          mode: body.mode,
          notifyCustomer: body.notifyCustomer === true,
          assignedToUserId: body.assignedToUserId,
        },
        config
      );
    }

    if (method === "POST" && conversationId && path.endsWith("/reply")) {
      const body = JSON.parse(event.body || "{}") as { content?: string };
      return sendManualConversationReply(auth!, conversationId, { content: body.content ?? "" }, config);
    }

    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Unsupported request", 400);
  },
  { requireAuth: true }
);
