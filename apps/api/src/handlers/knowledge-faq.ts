import { ingestFaqKnowledge, listFaqKnowledge, loadConfig } from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const config = loadConfig();
    const method = event.requestContext.http.method;

    if (method === "GET") {
      return listFaqKnowledge(auth!, config);
    }

    const body = parseBody<{
      items: Array<{ question: string; answer: string }>;
      append?: boolean;
    }>(event);
    return ingestFaqKnowledge(auth!, body, config);
  },
  { requireAuth: true }
);
