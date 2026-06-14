import { loadConfig, runBillingLifecycle } from "@commercechat/core";
import { ApiError, ErrorCodes, ok } from "@commercechat/shared";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { createHandler } from "../lib/handler";

function isAuthorized(event: APIGatewayProxyEventV2, secret?: string): boolean {
  if (!secret) return true;
  const header = event.headers?.["x-cron-secret"] ?? event.headers?.["X-Cron-Secret"];
  return header === secret;
}

export const handler = createHandler(async (event) => {
  const config = loadConfig();
  if (!isAuthorized(event, config.billingLifecycleCronSecret)) {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Forbidden", 403);
  }

  const result = await runBillingLifecycle(config);
  console.log(
    "[cron-billing-lifecycle]",
    `scanned=${result.scanned}`,
    `trialsExpired=${result.trialsExpired}`,
    `subscriptionsEnded=${result.subscriptionsEnded}`,
    `emailsSent=${result.emailsSent}`,
    `failed=${result.failed}`
  );

  return ok(result);
});
