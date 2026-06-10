import { inviteTeamMember, loadConfig } from "@commercechat/core";
import type { UserRole } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";
import { getAuthDeps } from "../lib/deps";

export const handler = createHandler(
  async (event, auth) => {
    const body = parseBody<{ email: string; role: UserRole; name: string }>(event);
    const deps = getAuthDeps();
    return inviteTeamMember(auth!, body, deps.config, deps.email);
  },
  { requireAuth: true, successStatus: 201 }
);
