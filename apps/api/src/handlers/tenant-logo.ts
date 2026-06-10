import { loadConfig, uploadTenantLogo } from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { getMultipartBody, getRequestContentType, parseMultipart } from "../lib/multipart";

export const handler = createHandler(
  async (event, auth) => {
    const contentType = getRequestContentType(event);
    if (!contentType.includes("multipart/form-data")) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "multipart/form-data required", 400);
    }

    const body = getMultipartBody(event);
    const parts = parseMultipart(body, contentType);
    const file =
      parts.find((p) => p.name === "file") ?? parts.find((p) => p.filename);

    if (!file?.data?.length) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "file is required", 400);
    }

    return uploadTenantLogo(
      auth!,
      { data: file.data, contentType: file.contentType },
      loadConfig()
    );
  },
  { requireAuth: true }
);
