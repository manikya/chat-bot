import { acceptTeamInvite, loadConfig } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const handler = createHandler(async (event) => {
  const body = parseBody<{ token: string; password: string; name?: string }>(event);
  return acceptTeamInvite(body, loadConfig());
});
