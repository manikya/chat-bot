import { PutCommand, QueryCommand, UpdateCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes, generateId, ok, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../../config";
import { getDocClient } from "../../db/client";
import { Keys } from "../../db/keys";
import type { CatalogProduct } from "../../ingest/parsers/catalog-csv";
import { getTenantConfig, updateTenantConfig } from "../../tenant/service";
import {
  fetchAllShopifyProducts,
  fetchShopifyShop,
  normalizeShopDomain,
  validateConnectShopifyBody,
  ensureShopifyProductWebhooks,
} from "./client";
import { syncCommerceChatScriptTag, removeCommerceChatScriptTags } from "./widget-script";
import {
  deleteShopifyCredentials,
  loadShopifyCredentials,
  saveShopifyCredentials,
} from "./credentials";
import type { ConnectShopifyBody, ShopifyProduct } from "./types";
import { getWidgetConfig } from "../../widget/service";
import { queueCommerceCatalogSync } from "../catalog-sync-trigger";

const SHOPIFY_SOURCE_NAME = "Shopify store";

async function putShopRouting(shopDomain: string, tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.shopRoutingPk(shopDomain),
        SK: Keys.shopRoutingSk(),
        tenantId,
        shopDomain,
        connectedAt: new Date().toISOString(),
      },
    })
  );
}

async function deleteShopRouting(shopDomain: string, config: CoreConfig) {
  const db = getDocClient(config);
  await db.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: { PK: Keys.shopRoutingPk(shopDomain), SK: Keys.shopRoutingSk() },
    })
  );
}

export async function resolveTenantByShopDomain(
  shopDomain: string,
  config: CoreConfig
): Promise<string | null> {
  const shop = normalizeShopDomain(shopDomain);
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.shopRoutingPk(shop), SK: Keys.shopRoutingSk() },
    })
  );
  return (res.Item?.tenantId as string) ?? null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function shopifyProductToCatalog(product: ShopifyProduct, shopDomain: string): CatalogProduct {
  const variants = product.variants ?? [];
  const variant = variants[0];
  const sku = variant?.sku?.trim() || `shopify-${product.id}`;
  const prices = variants
    .map((v) => parseFloat(v.price ?? "0"))
    .filter((price) => Number.isFinite(price) && price >= 0);
  const price = prices.length ? Math.min(...prices) : 0;
  const images = (product.images ?? [])
    .map((img) => img.src)
    .filter((src): src is string => Boolean(src));
  const primaryImage = product.image?.src ?? images[0];
  const inStock = variants.some((v) =>
    v.inventory_quantity == null ? product.status === "active" : (v.inventory_quantity ?? 0) > 0
  );
  const categories = [product.product_type, product.vendor]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return {
    sku,
    name: product.title,
    description: stripHtml(product.body_html || product.title),
    price,
    category: categories[0] || "General",
    categories: categories.length ? categories : undefined,
    imageUrl: primaryImage,
    imageUrls: images.length ? images : undefined,
    tags: product.tags?.trim() || undefined,
    sizes: variants
      .map((v) => [v.sku, v.price].filter(Boolean).join(": "))
      .filter(Boolean)
      .join("; ") || undefined,
    inStock,
    url: `https://${shopDomain}/products/${product.handle}`,
  };
}

export async function findShopifySourceId(tenantId: string, config: CoreConfig): Promise<string | null> {
  const db = getDocClient(config);
  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      FilterExpression: "#type = :t AND #status <> :d",
      ExpressionAttributeNames: { "#type": "type", "#status": "status" },
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": "SOURCE#",
        ":t": "shopify",
        ":d": "deleted",
      },
    })
  );
  const item = res.Items?.[0];
  return item ? (item.sourceId as string) : null;
}

async function ensureShopifySource(
  auth: AuthContext,
  shopDomain: string,
  config: CoreConfig
): Promise<string> {
  const existing = await findShopifySourceId(auth.tenantId, config);
  if (existing) return existing;

  const sourceId = generateId("src_");
  const now = new Date().toISOString();
  const db = getDocClient(config);

  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(auth.tenantId),
        SK: Keys.source(sourceId),
        sourceId,
        type: "shopify",
        name: SHOPIFY_SOURCE_NAME,
        status: "active",
        chunkCount: 0,
        vectorCount: 0,
        config: { shopDomain },
        createdAt: now,
        updatedAt: now,
      },
    })
  );

  return sourceId;
}

export async function getShopifyConnectorStatus(auth: AuthContext, config: CoreConfig) {
  const tenantConfig = await getTenantConfig(auth, config);
  const connector = tenantConfig.data!.commerceConnector;
  const creds = await loadShopifyCredentials(auth.tenantId, config);
  const sourceId = await findShopifySourceId(auth.tenantId, config);

  return ok({
    connected: connector.type === "shopify" && connector.status === "connected" && Boolean(creds),
    shopDomain: creds?.shopDomain ?? (connector as { siteUrl?: string }).siteUrl,
    lastSyncAt: (connector as { lastSyncAt?: string }).lastSyncAt,
    sourceId,
    widgetEnabled: tenantConfig.data!.widgetConfig?.widgetEnabled !== false,
  });
}

function readWidgetEnabled(tenantConfig: { widgetConfig?: { widgetEnabled?: boolean } }): boolean {
  return tenantConfig.widgetConfig?.widgetEnabled !== false;
}

export async function getShopifyWidgetSettings(auth: AuthContext, config: CoreConfig) {
  const tenantConfig = await getTenantConfig(auth, config);
  const creds = await loadShopifyCredentials(auth.tenantId, config);
  if (!creds) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Shopify is not connected", 400);
  }
  return ok({
    widgetEnabled: readWidgetEnabled(tenantConfig.data!),
    hasWidgetApiKey: Boolean(creds.widgetApiKey),
  });
}

export async function setShopifyWidgetEnabled(
  auth: AuthContext,
  enabled: boolean,
  config: CoreConfig,
  options?: { widgetApiKey?: string }
) {
  const tenantConfig = await getTenantConfig(auth, config);
  const creds = await loadShopifyCredentials(auth.tenantId, config);
  if (!creds) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Shopify is not connected", 400);
  }

  const widgetApiKey = options?.widgetApiKey ?? creds.widgetApiKey;
  const nextCreds =
    options?.widgetApiKey && options.widgetApiKey !== creds.widgetApiKey
      ? { ...creds, widgetApiKey: options.widgetApiKey, updatedAt: new Date().toISOString() }
      : creds;

  if (options?.widgetApiKey) {
    await saveShopifyCredentials(auth.tenantId, nextCreds, config);
  }

  await updateTenantConfig(
    auth,
    {
      widgetConfig: {
        ...tenantConfig.data!.widgetConfig,
        widgetEnabled: enabled,
      },
    },
    config
  );

  try {
    await syncCommerceChatScriptTag(nextCreds, widgetApiKey, enabled, config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, message, 400);
  }

  return ok({ widgetEnabled: enabled });
}

export async function getShopifyWidgetSettingsForTenant(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const configRes = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.config() },
    })
  );
  if (!configRes.Item) {
    return { widgetEnabled: true };
  }
  return { widgetEnabled: readWidgetEnabled(configRes.Item as { widgetConfig?: { widgetEnabled?: boolean } }) };
}

export async function connectShopifyStore(
  auth: AuthContext,
  body: ConnectShopifyBody,
  config: CoreConfig,
  connectOptions?: { widgetApiKey?: string }
) {
  const creds = validateConnectShopifyBody(body);
  const shop = await fetchShopifyShop(creds, config);

  const storedCreds = {
    ...creds,
    ...(connectOptions?.widgetApiKey ? { widgetApiKey: connectOptions.widgetApiKey } : {}),
    updatedAt: new Date().toISOString(),
  };
  await saveShopifyCredentials(auth.tenantId, storedCreds, config);
  await putShopRouting(creds.shopDomain, auth.tenantId, config);
  const sourceId = await ensureShopifySource(auth, creds.shopDomain, config);

  const webhookUrl = `${config.apiPublicUrl.replace(/\/$/, "")}/shopify-app/webhooks`;
  try {
    await ensureShopifyProductWebhooks(creds, webhookUrl, config);
  } catch (err) {
    console.warn(
      "[shopify] product webhook registration failed",
      creds.shopDomain,
      err instanceof Error ? err.message : err
    );
  }

  void queueCommerceCatalogSync(auth.tenantId, "shopify", config).catch((err) => {
    console.warn(
      "[shopify] initial catalog sync queue failed",
      auth.tenantId,
      err instanceof Error ? err.message : err
    );
  });

  await updateTenantConfig(
    auth,
    {
      commerceConnector: {
        type: "shopify",
        status: "connected",
        checkoutBaseUrl: `https://${creds.shopDomain}`,
        siteUrl: `https://${creds.shopDomain}`,
        storeName: shop.name,
        currency: shop.currency,
        lastSyncAt: undefined,
      },
      widgetConfig: {
        widgetEnabled: true,
      },
    },
    config
  );

  if (connectOptions?.widgetApiKey) {
    try {
      await syncCommerceChatScriptTag(storedCreds, connectOptions.widgetApiKey, true, config);
    } catch (err) {
      console.warn(
        "[shopify] widget script tag install failed",
        creds.shopDomain,
        err instanceof Error ? err.message : err
      );
    }
  }

  return ok({
    connected: true,
    shopDomain: creds.shopDomain,
    storeName: shop.name,
    planName: shop.plan_name,
    sourceId,
  });
}

export async function disconnectShopifyStore(auth: AuthContext, config: CoreConfig) {
  const creds = await loadShopifyCredentials(auth.tenantId, config);
  if (creds) {
    try {
      await removeCommerceChatScriptTags(creds);
    } catch (err) {
      console.warn(
        "[shopify] script tag removal failed",
        creds.shopDomain,
        err instanceof Error ? err.message : err
      );
    }
  }
  await deleteShopifyCredentials(auth.tenantId, config);
  if (creds?.shopDomain) {
    await deleteShopRouting(creds.shopDomain, config);
  }

  const sourceId = await findShopifySourceId(auth.tenantId, config);
  if (sourceId) {
    const db = getDocClient(config);
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.source(sourceId) },
        UpdateExpression: "SET #status = :d, #updatedAt = :u",
        ExpressionAttributeNames: { "#status": "status", "#updatedAt": "updatedAt" },
        ExpressionAttributeValues: { ":d": "deleted", ":u": new Date().toISOString() },
      })
    );
  }

  await updateTenantConfig(
    auth,
    {
      commerceConnector: {
        type: "manual",
        status: "disconnected",
        checkoutBaseUrl: "",
      },
    },
    config
  );

  return ok({ disconnected: true });
}

export async function fetchShopifyCatalogProducts(
  tenantId: string,
  config: CoreConfig
): Promise<CatalogProduct[]> {
  const creds = await loadShopifyCredentials(tenantId, config);
  if (!creds) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Shopify store is not connected", 400);
  }
  const items = await fetchAllShopifyProducts(creds, config);
  return items.map((p) => shopifyProductToCatalog(p, creds.shopDomain));
}

export async function touchShopifySyncTimestamp(auth: AuthContext, config: CoreConfig) {
  const tenantConfig = await getTenantConfig(auth, config);
  const connector = tenantConfig.data!.commerceConnector;
  if (connector.type !== "shopify") return;

  await updateTenantConfig(
    auth,
    {
      commerceConnector: {
        ...connector,
        lastSyncAt: new Date().toISOString(),
      },
    },
    config
  );
}

export async function ensureShopifyWebhooksForTenant(tenantId: string, config: CoreConfig) {
  const creds = await loadShopifyCredentials(tenantId, config);
  if (!creds) return;
  await putShopRouting(creds.shopDomain, tenantId, config);
  const webhookUrl = `${config.apiPublicUrl.replace(/\/$/, "")}/shopify-app/webhooks`;
  await ensureShopifyProductWebhooks(creds, webhookUrl, config);
}

export async function getShopifyWidgetBootstrap(tenantId: string, config: CoreConfig) {
  const creds = await loadShopifyCredentials(tenantId, config);
  if (!creds) {
    throw new ApiError(ErrorCodes.UNAUTHORIZED, "Shopify store is not connected", 401);
  }

  const widget = await getWidgetConfig(tenantId, config);
  const scriptBase = (config.widgetCdnUrl ?? config.apiPublicUrl).replace(/\/$/, "");
  return ok({
    apiPublicUrl: config.apiPublicUrl.replace(/\/$/, ""),
    widgetScriptUrl: `${scriptBase}/widget/v1.js`,
    storeName: widget.data?.storeName,
    greeting: widget.data?.greeting,
    primaryColor: widget.data?.primaryColor,
    position: widget.data?.position,
    suggestedQuestions: widget.data?.suggestedQuestions ?? [],
    enabled: widget.data?.enabled ?? true,
  });
}

export { normalizeShopDomain };
