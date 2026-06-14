import { syncKnowledgeSource, loadConfig } from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { pathParam } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const sourceId = pathParam(event, "sourceId");
    if (!sourceId) throw new ApiError(ErrorCodes.VALIDATION_ERROR, "sourceId required", 400);
    return syncKnowledgeSource(auth!, sourceId, loadConfig());
  },
  { requireAuth: true, minRole: "admin", successStatus: 202 }
);
