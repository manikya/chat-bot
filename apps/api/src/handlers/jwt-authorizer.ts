import type {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerWithContextResult,
} from "aws-lambda";
import { verifyAccessToken, loadConfig } from "@commercechat/core";

export async function handler(
  event: APIGatewayRequestAuthorizerEventV2
): Promise<APIGatewaySimpleAuthorizerWithContextResult<Record<string, string>>> {
  try {
    const token = event.identitySource?.[0]?.replace("Bearer ", "");
    if (!token) return { isAuthorized: false, context: {} };

    const claims = await verifyAccessToken(token, loadConfig());
    return {
      isAuthorized: true,
      context: {
        tenantId: claims.tid,
        userId: claims.sub,
        role: claims.role,
        email: claims.email,
      },
    };
  } catch {
    return { isAuthorized: false, context: {} };
  }
}
