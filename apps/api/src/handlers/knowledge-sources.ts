import {
  createKnowledgeSource,
  deleteKnowledgeSource,
  listKnowledgeSources,
  loadConfig,
} from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { parseBody, pathParam } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const config = loadConfig();
    const method = event.requestContext.http.method;

    if (method === "GET") {
      return listKnowledgeSources(auth!, config);
    }
    if (method === "POST") {
      const body = parseBody<{ type: string; name: string; config?: Record<string, unknown> }>(event);
      return createKnowledgeSource(auth!, body, config);
    }
    if (method === "DELETE") {
      const sourceId = pathParam(event, "sourceId");
      if (!sourceId) throw new ApiError(ErrorCodes.VALIDATION_ERROR, "sourceId required", 400);
      return deleteKnowledgeSource(auth!, sourceId, config);
    }
    throw new Error(`Unsupported method: ${method}`);
  },
  { requireAuth: true, successStatus: 200 }
);
