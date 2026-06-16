import {
  connectShopifyStore,
  disconnectShopifyStore,
  ensureShopifyWebhooksForTenant,
  getShopifyConnectorStatus,
  getShopifyWidgetBootstrap,
  getShopifyWidgetSettings,
  loadConfig,
  setShopifyWidgetEnabled,
  syncKnowledgeSource,
  type ConnectShopifyBody,
} from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createApiKeyHandler, createHandler } from "../lib/handler";
import { getApiKey, parseBody } from "../lib/apigw";

export const statusHandler = createHandler(
  async (_event, auth) => getShopifyConnectorStatus(auth!, loadConfig()),
  { requireAuth: true }
);

export const connectHandler = createHandler(
  async (event, auth) => {
    const body = parseBody<ConnectShopifyBody>(event);
    return connectShopifyStore(auth!, body, loadConfig());
  },
  { requireAuth: true }
);

/** Store API key (pk_live_*) — Shopify app calls after OAuth to link the shop. */
export const connectStoreHandler = createApiKeyHandler(async (event, tenantId) => {
  const body = parseBody<ConnectShopifyBody>(event);
  const widgetApiKey = getApiKey(event);
  return connectShopifyStore(
    { tenantId, userId: "store", role: "admin", email: "store@commercechat" },
    body,
    loadConfig(),
    { widgetApiKey: widgetApiKey ?? undefined }
  );
});

export const widgetSettingsHandler = createHandler(
  async (_event, auth) => getShopifyWidgetSettings(auth!, loadConfig()),
  { requireAuth: true }
);

export const widgetPatchHandler = createHandler(
  async (event, auth) => {
    const body = parseBody<{ widgetEnabled?: boolean }>(event);
    if (typeof body.widgetEnabled !== "boolean") {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "widgetEnabled must be a boolean", 400);
    }
    return setShopifyWidgetEnabled(auth!, body.widgetEnabled, loadConfig());
  },
  { requireAuth: true }
);

/** Shopify app / storefront toggle using widget API key. */
export const widgetPatchStoreHandler = createApiKeyHandler(async (event, tenantId) => {
  const body = parseBody<{ widgetEnabled?: boolean }>(event);
  if (typeof body.widgetEnabled !== "boolean") {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "widgetEnabled must be a boolean", 400);
  }
  const widgetApiKey = getApiKey(event);
  return setShopifyWidgetEnabled(
    { tenantId, userId: "store", role: "admin", email: "store@commercechat" },
    body.widgetEnabled,
    loadConfig(),
    { widgetApiKey: widgetApiKey ?? undefined }
  );
});

export const disconnectHandler = createHandler(
  async (_event, auth) => disconnectShopifyStore(auth!, loadConfig()),
  { requireAuth: true, noBody: true, successStatus: 204 }
);

export const syncHandler = createHandler(
  async (_event, auth) => {
    const status = await getShopifyConnectorStatus(auth!, loadConfig());
    const sourceId = status.data?.sourceId;
    if (!sourceId) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Shopify is not connected", 400);
    }
    const config = loadConfig();
    try {
      await ensureShopifyWebhooksForTenant(auth!.tenantId, config);
    } catch (err) {
      console.warn(
        "[shopify] webhook repair failed",
        auth!.tenantId,
        err instanceof Error ? err.message : err
      );
    }
    return syncKnowledgeSource(auth!, sourceId, config);
  },
  { requireAuth: true, successStatus: 202 }
);

/** Public (store API key) — Shopify theme script loads widget config. */
export const widgetBootstrapHandler = createApiKeyHandler(async (_event, tenantId) =>
  getShopifyWidgetBootstrap(tenantId, loadConfig())
);
