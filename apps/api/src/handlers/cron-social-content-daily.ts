import { loadConfig, runDailySocialContentCron } from "@commercechat/core";
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
  const result = await runDailySocialContentCron(config);
  console.log(
    "[cron-social-content-daily]",
    `scanned=${result.scanned}`,
    `generated=${result.generated}`,
    `pushed=${result.pushed}`,
    `staleRemoved=${result.staleRemoved}`,
    `failed=${result.failed}`
  );
  return result;
}

const httpHandler = createHandler(async (event) => {
  const config = loadConfig();
  if (!isAuthorized(event, config.socialContentCronSecret)) {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Forbidden", 403);
  }
  return ok(await runJob());
});

export const handler = wrapCronHandler(runJob, httpHandler);
