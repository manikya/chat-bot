import { signup } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";
import { getAuthDeps } from "../lib/deps";

export const handler = createHandler(async (event) => {
  const body = parseBody<{
    storeName: string;
    email: string;
    password: string;
    name: string;
    timezone: string;
  }>(event);
  return signup(body, getAuthDeps());
});
