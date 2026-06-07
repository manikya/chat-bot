import { listKnowledgeJobs, loadConfig } from "@commercechat/core";
import { createHandler } from "../lib/handler";

export const handler = createHandler(
  async (_event, auth) => listKnowledgeJobs(auth!, loadConfig()),
  { requireAuth: true }
);
