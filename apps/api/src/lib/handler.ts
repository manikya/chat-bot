import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { errors as joseErrors } from "jose";
import { verifyAccessToken, toAuthContext, loadConfig } from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import {
  type ApiHandler,
  getBearerToken,
  handleError,
  toApigwResponse,
  corsHeaders,
} from "./apigw";

export function createHandler(
  fn: ApiHandler,
  options?: { requireAuth?: boolean; successStatus?: number; noBody?: boolean }
) {
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
        let claims;
        try {
          claims = await verifyAccessToken(token, loadConfig());
        } catch (error) {
          if (error instanceof joseErrors.JWTExpired) {
            throw new ApiError(ErrorCodes.TOKEN_EXPIRED, "Access token expired", 401);
          }
          throw new ApiError(ErrorCodes.UNAUTHORIZED, "Invalid token", 401);
        }
        auth = toAuthContext(claims);
      }
      const result = await fn(event, auth);
      const status =
        options?.successStatus ??
        (event.requestContext.http.method === "POST" && event.rawPath.includes("/auth/signup")
          ? 201
          : 200);

      if (options?.noBody && result.success) {
        return { statusCode: status, headers: corsHeaders() };
      }
      return toApigwResponse(result, result.success ? status : 400);
    } catch (error) {
      return handleError(error);
    }
  };
}
