import { loadConfig, queueCommerceCatalogSync } from "@commercechat/core";
import { ok } from "@commercechat/shared";
import { createApiKeyHandler } from "../lib/handler";

/** WooCommerce plugin notifies CommerceChat when products change. */
export const woocommerceCatalogHandler = createApiKeyHandler(async (_event, tenantId) => {
  const result = await queueCommerceCatalogSync(tenantId, "woocommerce", loadConfig());
  return ok(result);
}, { successStatus: 202 });
