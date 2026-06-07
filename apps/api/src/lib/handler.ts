import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { verifyAccessToken, toAuthContext, loadConfig } from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import {
  type ApiHandler,
  getBearerToken,
  handleError,
  toApigwResponse,
  corsHeaders,
} from "./apigw";

export function createHandler(fn: ApiHandler, options?: { requireAuth?: boolean }) {
  return async (
    event: APIGatewayProxyEventV2,
    _context: Context
  ): Promise<APIGatewayProxyResultV2> => {
    if (event.requestContext.http.method === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders() };
    }

    try {
      let auth = null;
      if (options?.requireAuth) {
        const token = getBearerToken(event);
        if (!token) throw new ApiError(ErrorCodes.UNAUTHORIZED, "Missing authorization", 401);
        const claims = await verifyAccessToken(token, loadConfig());
        auth = toAuthContext(claims);
      }
      const result = await fn(event, auth);
      const status = event.requestContext.http.method === "POST" && event.rawPath.includes("/auth/signup") ? 201 : 200;
      return toApigwResponse(result, result.success ? status : 400);
    } catch (error) {
      return handleError(error);
    }
  };
}
