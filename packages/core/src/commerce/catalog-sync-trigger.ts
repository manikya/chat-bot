import { ApiError, ErrorCodes, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { syncKnowledgeSource } from "../knowledge/service";
import { findShopifySourceId } from "./shopify/service";
import { findWooCommerceSourceId } from "./wordpress/service";

export type CommerceConnectorType = "shopify" | "woocommerce";

export type CatalogSyncQueueResult = {
  queued: boolean;
  jobId?: string;
  reason?: "no_source" | "already_syncing" | "quota" | "tenant_suspended" | "error";
};

function systemAuth(tenantId: string): AuthContext {
  return { tenantId, userId: "system", role: "admin", email: "system@commercechat" };
}

export async function queueCommerceCatalogSync(
  tenantId: string,
  connector: CommerceConnectorType,
  config: CoreConfig
): Promise<CatalogSyncQueueResult> {
  const sourceId =
    connector === "shopify"
      ? await findShopifySourceId(tenantId, config)
      : await findWooCommerceSourceId(tenantId, config);

  if (!sourceId) {
    console.warn(`[commerce-sync] no ${connector} source for tenant`, tenantId);
    return { queued: false, reason: "no_source" };
  }

  try {
    const result = await syncKnowledgeSource(systemAuth(tenantId), sourceId, config);
    return { queued: true, jobId: result.data?.jobId };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === ErrorCodes.VALIDATION_ERROR && /already in progress/i.test(err.message)) {
        return { queued: false, reason: "already_syncing" };
      }
      if (err.statusCode === 403 || /suspended|operational/i.test(err.message)) {
        return { queued: false, reason: "tenant_suspended" };
      }
      if (/vector|quota/i.test(err.message)) {
        return { queued: false, reason: "quota" };
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[commerce-sync] failed to queue ${connector} sync for`, tenantId, message);
    return { queued: false, reason: "error" };
  }
}
