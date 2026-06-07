import { resetPassword } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";
import { getAuthDeps } from "../lib/deps";

export const handler = createHandler(async (event) => {
  const body = parseBody<{ token: string; password: string }>(event);
  return resetPassword(body.token, body.password, getAuthDeps());
});
