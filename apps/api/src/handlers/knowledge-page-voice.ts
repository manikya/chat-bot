import {
  getPageVoiceStatus,
  loadConfig,
  syncPageVoice,
  updatePageVoiceSettings,
  uploadPageVoiceHistory,
} from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { getMultipartBody, getRequestContentType, parseMultipart } from "../lib/multipart";
import { parseBody } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const config = loadConfig();
    const method = event.requestContext.http.method;
    const path = event.rawPath ?? "";

    if (method === "GET" && path.endsWith("/page-voice")) {
      return getPageVoiceStatus(auth!, config);
    }

    if (method === "PATCH" && path.endsWith("/page-voice")) {
      const body = parseBody<{ learningPaused?: boolean }>(event);
      return updatePageVoiceSettings(auth!, body, config);
    }

    if (method === "POST" && path.endsWith("/page-voice/sync")) {
      return syncPageVoice(auth!, config);
    }

    if (method === "POST" && path.endsWith("/page-voice/upload")) {
      const contentType = getRequestContentType(event);
      if (!contentType.includes("multipart/form-data")) {
        throw new ApiError(ErrorCodes.VALIDATION_ERROR, "multipart/form-data required", 400);
      }
      const body = getMultipartBody(event);
      const parts = parseMultipart(body, contentType);
      const file =
        parts.find((p) => p.name === "file") ?? parts.find((p) => p.filename);
      if (!file?.data?.length) {
        throw new ApiError(ErrorCodes.VALIDATION_ERROR, "File is required", 400);
      }
      return uploadPageVoiceHistory(
        auth!,
        file.filename ?? "conversations.json",
        file.data.toString("utf8"),
        config
      );
    }

    throw new Error(`Unsupported method: ${method}`);
  },
  { requireAuth: true }
);
