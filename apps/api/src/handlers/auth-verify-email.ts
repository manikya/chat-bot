import { verifyEmail } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";
import { getAuthDeps } from "../lib/deps";

export const handler = createHandler(async (event) => {
  const body = parseBody<{ token: string }>(event);
  return verifyEmail(body.token, getAuthDeps());
});
