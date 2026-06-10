import { ingestFaqKnowledge, loadConfig } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const body = parseBody<{ items: Array<{ question: string; answer: string }> }>(event);
    return ingestFaqKnowledge(auth!, body, loadConfig());
  },
  { requireAuth: true }
);
