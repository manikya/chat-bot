import {
  createCatalogKnowledgeSource,
  createKnowledgeSource,
  deleteKnowledgeSource,
  listKnowledgeSources,
  loadConfig,
} from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { getMultipartBody, getRequestContentType, parseMultipart } from "../lib/multipart";
import { parseBody, pathParam } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const config = loadConfig();
    const method = event.requestContext.http.method;

    if (method === "GET") {
      return listKnowledgeSources(auth!, config);
    }
    if (method === "POST") {
      const contentType = getRequestContentType(event);
      if (contentType.includes("multipart/form-data")) {
        const body = getMultipartBody(event);
        const parts = parseMultipart(body, contentType);
        const type = parts.find((p) => p.name === "type")?.data.toString("utf8").trim();
        const name = parts.find((p) => p.name === "name")?.data.toString("utf8").trim();
        const file =
          parts.find((p) => p.name === "file") ??
          parts.find((p) => p.filename);

        if (type !== "catalog") {
          throw new ApiError(
            ErrorCodes.VALIDATION_ERROR,
            "Multipart upload supports type=catalog only",
            400
          );
        }
        if (!file?.data?.length) {
          throw new ApiError(ErrorCodes.VALIDATION_ERROR, "CSV file is required", 400);
        }

        return createCatalogKnowledgeSource(
          auth!,
          {
            name: name || "Product catalog",
            filename: file.filename ?? "products.csv",
            csvContent: file.data.toString("utf8"),
          },
          config
        );
      }

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
