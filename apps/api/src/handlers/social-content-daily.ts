import { generateDailySocialContent, getDailySocialContent, loadConfig } from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";

export const handler = createHandler(
  async (event, auth) => {
    const config = loadConfig();
    const method = event.requestContext.http.method;
    if (method === "GET") {
      return getDailySocialContent(auth!, config);
    }
    if (method === "POST" && event.rawPath.endsWith("/generate")) {
      return generateDailySocialContent(auth!, config, { force: true });
    }
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Method not allowed", 405);
  },
  { requireAuth: true }
);
