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

export function pathParam(event: APIGatewayProxyEventV2, name: string): string | undefined {
  return event.pathParameters?.[name];
}

export function matchPathParams(
  path: string,
  pattern: RegExp,
  names: string[]
): Record<string, string> | null {
  const match = path.match(pattern);
  if (!match) return null;
  const params: Record<string, string> = {};
  names.forEach((name, i) => {
    params[name] = match[i + 1];
  });
  return params;
}

export function getBearerToken(event: APIGatewayProxyEventV2): string | null {
  const auth = event.headers?.authorization ?? event.headers?.Authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export function getApiKey(event: APIGatewayProxyEventV2): string | null {
  return event.headers?.["x-api-key"] ?? event.headers?.["X-API-Key"] ?? null;
}

export function queryParam(event: APIGatewayProxyEventV2, name: string): string | undefined {
  return event.queryStringParameters?.[name];
}

export function toApigwResponse(result: ApiResponse<unknown>, statusCode = 200): APIGatewayProxyResultV2 {
  if (!result.success && result.error) {
    const code = result.error.code;
    const status =
      code === "UNAUTHORIZED" || code === "INVALID_CREDENTIALS" || code === "TOKEN_EXPIRED" ? 401
      : code === "FORBIDDEN" || code === "EMAIL_NOT_VERIFIED" || code === "ACCOUNT_LOCKED" ? 403
      : code === "NOT_FOUND" ? 404
      : code === "EMAIL_EXISTS" ? 409
      : code === "PLAN_LIMIT_EXCEEDED" ? 403
      : code === "ONBOARDING_INCOMPLETE" ? 400
      : code === "INVITE_EXPIRED" ? 422
      : code === "INVITE_USED" ? 400
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
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-API-Key,X-Requested-With",
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
