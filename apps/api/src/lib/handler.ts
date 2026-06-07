import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { errors as joseErrors } from "jose";
import { verifyAccessToken, toAuthContext, loadConfig } from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { verifyWidgetApiKey } from "@commercechat/core";
import {
  type ApiHandler,
  getApiKey,
  getBearerToken,
  handleError,
  toApigwResponse,
  corsHeaders,
} from "./apigw";

export type ApiKeyHandler = (
  event: APIGatewayProxyEventV2,
  tenantId: string
) => ReturnType<ApiHandler>;

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
      let status = options?.successStatus ?? 200;
      if (!options?.successStatus) {
        if (event.requestContext.http.method === "POST" && event.rawPath.includes("/auth/signup")) {
          status = 201;
        } else if (
          event.requestContext.http.method === "POST" &&
          event.rawPath.endsWith("/knowledge/sources")
        ) {
          status = 201;
        } else if (
          event.requestContext.http.method === "DELETE" &&
          event.rawPath.includes("/knowledge/sources/")
        ) {
          status = 202;
        }
      }

      if (options?.noBody && result.success) {
        return { statusCode: status, headers: corsHeaders() };
      }
      return toApigwResponse(result, result.success ? status : 400);
    } catch (error) {
      return handleError(error);
    }
  };
}

export function createApiKeyHandler(
  fn: ApiKeyHandler,
  options?: { successStatus?: number }
) {
  return async (
    event: APIGatewayProxyEventV2,
    _context: Context
  ): Promise<APIGatewayProxyResultV2> => {
    if (event.requestContext.http.method === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders() };
    }

    try {
      const apiKey = getApiKey(event);
      if (!apiKey) throw new ApiError(ErrorCodes.UNAUTHORIZED, "Missing X-API-Key header", 401);
      const tenantId = await verifyWidgetApiKey(apiKey, loadConfig());
      const result = await fn(event, tenantId);
      const status = options?.successStatus ?? 200;
      return toApigwResponse(result, result.success ? status : 400);
    } catch (error) {
      return handleError(error);
    }
  };
}

export function createTenantHandler(
  fn: ApiKeyHandler,
  options?: { successStatus?: number }
) {
  return async (
    event: APIGatewayProxyEventV2,
    _context: Context
  ): Promise<APIGatewayProxyResultV2> => {
    if (event.requestContext.http.method === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders() };
    }

    try {
      const config = loadConfig();
      let tenantId: string | null = null;
      const token = getBearerToken(event);
      const apiKey = getApiKey(event);

      if (token) {
        try {
          const claims = await verifyAccessToken(token, config);
          tenantId = toAuthContext(claims).tenantId;
        } catch (error) {
          if (error instanceof joseErrors.JWTExpired) {
            throw new ApiError(ErrorCodes.TOKEN_EXPIRED, "Access token expired", 401);
          }
        }
      }
      if (!tenantId && apiKey) {
        tenantId = await verifyWidgetApiKey(apiKey, config);
      }
      if (!tenantId) {
        throw new ApiError(ErrorCodes.UNAUTHORIZED, "Missing Bearer token or X-API-Key", 401);
      }

      const result = await fn(event, tenantId);
      const status = options?.successStatus ?? 200;
      return toApigwResponse(result, result.success ? status : 400);
    } catch (error) {
      return handleError(error);
    }
  };
}
