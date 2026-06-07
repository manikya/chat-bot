import { getMe } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { getAuthDeps } from "../lib/deps";

export const handler = createHandler(
  async (_event, auth) => getMe(auth!, getAuthDeps()),
  { requireAuth: true }
);
