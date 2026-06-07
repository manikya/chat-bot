import { login } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";
import { getAuthDeps } from "../lib/deps";

export const handler = createHandler(async (event) => {
  const body = parseBody<{ email: string; password: string }>(event);
  return login(body, getAuthDeps());
});
