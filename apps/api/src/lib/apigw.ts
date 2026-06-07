import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { ApiError, fail, type ApiResponse } from "@commercechat/shared";
import type { AuthContext } from "@commercechat/shared";

export type ApiHandler = (
  event: APIGatewayProxyEventV2,
  auth: AuthContext | null
) => Promise<ApiResponse<unknown>>;

export function parseBody<T>(event: APIGatewayProxyEventV2): T {
  if (!event.body) return {} as T;
  try {
    return JSON.parse(
      event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body
    ) as T;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }
}

export function getBearerToken(event: APIGatewayProxyEventV2): string | null {
  const auth = event.headers?.authorization ?? event.headers?.Authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export function toApigwResponse(result: ApiResponse<unknown>, statusCode = 200): APIGatewayProxyResultV2 {
  if (!result.success && result.error) {
    const code = result.error.code;
    const status =
      code === "UNAUTHORIZED" || code === "INVALID_CREDENTIALS" || code === "TOKEN_EXPIRED" ? 401
      : code === "FORBIDDEN" || code === "EMAIL_NOT_VERIFIED" || code === "ACCOUNT_LOCKED" ? 403
      : code === "NOT_FOUND" ? 404
      : code === "EMAIL_EXISTS" ? 409
      : 400;
    return {
      statusCode: status,
      headers: corsHeaders(),
      body: JSON.stringify(result),
    };
  }
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(result),
  };
}

export function corsHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  };
}

export function handleError(error: unknown): APIGatewayProxyResultV2 {
  if (error instanceof ApiError) {
    return toApigwResponse(fail(error), error.statusCode);
  }
  console.error(error);
  return toApigwResponse(
    fail(new ApiError("INTERNAL_ERROR", "Internal server error", 500)),
    500
  );
}
