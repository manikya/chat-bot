import { listTeamMembers, loadConfig } from "@commercechat/core";
import { createHandler } from "../lib/handler";

export const handler = createHandler(
  async (_event, auth) => listTeamMembers(auth!, loadConfig()),
  { requireAuth: true }
);
