import { loadConfig, runBillingLifecycle } from "@commercechat/core";
import { ApiError, ErrorCodes, ok } from "@commercechat/shared";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { createHandler } from "../lib/handler";
import { wrapCronHandler } from "../lib/cron";

function isAuthorized(event: APIGatewayProxyEventV2, secret?: string): boolean {
  if (!secret) return true;
  const header = event.headers?.["x-cron-secret"] ?? event.headers?.["X-Cron-Secret"];
  return header === secret;
}

async function runJob() {
  const config = loadConfig();
  const result = await runBillingLifecycle(config);
  console.log(
    "[cron-billing-lifecycle]",
    `scanned=${result.scanned}`,
    `trialsExpired=${result.trialsExpired}`,
    `subscriptionsEnded=${result.subscriptionsEnded}`,
    `emailsSent=${result.emailsSent}`,
    `failed=${result.failed}`
  );
  return result;
}

const httpHandler = createHandler(async (event) => {
  const config = loadConfig();
  if (!isAuthorized(event, config.billingLifecycleCronSecret)) {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Forbidden", 403);
  }
  const result = await runJob();
  return ok(result);
});

export const handler = wrapCronHandler(runJob, httpHandler);
