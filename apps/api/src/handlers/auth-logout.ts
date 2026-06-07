import { logout } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";
import { getAuthDeps } from "../lib/deps";

export const handler = createHandler(
  async (event) => {
    const body = parseBody<{ refreshToken: string }>(event);
    return logout(body.refreshToken, getAuthDeps());
  },
  { requireAuth: true, successStatus: 204, noBody: true }
);
