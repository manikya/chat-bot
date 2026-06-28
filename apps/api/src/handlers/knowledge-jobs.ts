import { cancelKnowledgeJob, getKnowledgeJob, listKnowledgeJobs, loadConfig } from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { pathParam } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const jobId = pathParam(event, "jobId");
    const config = loadConfig();
    if (jobId) {
      if (event.requestContext.http.method === "POST" && event.rawPath.endsWith("/cancel")) {
        return cancelKnowledgeJob(auth!, jobId, config);
      }
      if (event.requestContext.http.method !== "GET") {
        throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Method not allowed", 405);
      }
      return getKnowledgeJob(auth!, jobId, config);
    }
    if (event.requestContext.http.method !== "GET") {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Method not allowed", 405);
    }
    return listKnowledgeJobs(auth!, config);
  },
  { requireAuth: true }
);
