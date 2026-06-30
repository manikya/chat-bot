import {
  cancelKnowledgeJob,
  getKnowledgeJob,
  getMobileAiSnapshotDelta,
  getMobileAiSnapshotManifest,
  listKnowledgeJobs,
  loadConfig,
} from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { pathParam, queryParam } from "../lib/apigw";

function parseOptionalNumber(value: string | undefined, name: string): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, `${name} must be a positive number`, 400);
  }
  return parsed;
}

export const handler = createHandler(
  async (event, auth) => {
    const jobId = pathParam(event, "jobId");
    const config = loadConfig();
    if (event.rawPath === "/api/v1/mobile-ai/snapshot") {
      if (event.requestContext.http.method !== "GET") {
        throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Method not allowed", 405);
      }
      const kind = queryParam(event, "kind");
      if (kind === "manifest") {
        return getMobileAiSnapshotManifest(auth!, config);
      }
      if (kind === "chunks") {
        return getMobileAiSnapshotDelta(auth!, config, {
          sinceVersion: parseOptionalNumber(queryParam(event, "sinceVersion"), "sinceVersion"),
          maxChunks: parseOptionalNumber(queryParam(event, "maxChunks"), "maxChunks"),
        });
      }
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "kind must be manifest or chunks", 400);
    }
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
