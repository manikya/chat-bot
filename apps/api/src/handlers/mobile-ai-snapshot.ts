import {
  getMobileAiSnapshotDelta,
  getMobileAiSnapshotManifest,
  loadConfig,
} from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { queryParam } from "../lib/apigw";

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
    const config = loadConfig();
    const path = event.rawPath;

    if (event.requestContext.http.method !== "GET") {
      throw new Error(`Unsupported method: ${event.requestContext.http.method}`);
    }

    if (path.endsWith("/manifest")) {
      return getMobileAiSnapshotManifest(auth!, config);
    }

    if (path.endsWith("/chunks")) {
      return getMobileAiSnapshotDelta(auth!, config, {
        sinceVersion: parseOptionalNumber(queryParam(event, "sinceVersion"), "sinceVersion"),
        maxChunks: parseOptionalNumber(queryParam(event, "maxChunks"), "maxChunks"),
      });
    }

    throw new ApiError(ErrorCodes.NOT_FOUND, "Mobile AI snapshot route not found", 404);
  },
  { requireAuth: true }
);
