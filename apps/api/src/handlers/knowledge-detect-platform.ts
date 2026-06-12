import { detectStorePlatform } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const handler = createHandler(
  async (event, _auth) => {
    const body = parseBody<{ url: string }>(event);
    return detectStorePlatform(body.url ?? "");
  },
  { requireAuth: true }
);
