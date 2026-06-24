import { listCommerceProducts, loadConfig, regenerateCommerceProductAttributes } from "@commercechat/core";
import { createHandler } from "../lib/handler";

export const handler = createHandler(
  async (event, auth) => {
    if (event.requestContext.http.method === "POST") {
      return regenerateCommerceProductAttributes(auth!, loadConfig());
    }
    const params = event.queryStringParameters ?? {};
    const q = params.q;
    const limit = params.limit ? Number(params.limit) : undefined;
    return listCommerceProducts(auth!, loadConfig(), { q, limit });
  },
  { requireAuth: true }
);
