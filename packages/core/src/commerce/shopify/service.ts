import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
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
} from "./client";
import {
  deleteShopifyCredentials,
  loadShopifyCredentials,
  saveShopifyCredentials,
} from "./credentials";
import type { ConnectShopifyBody, ShopifyProduct } from "./types";
import { getWidgetConfig } from "../../widget/service";

const SHOPIFY_SOURCE_NAME = "Shopify store";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function shopifyProductToCatalog(product: ShopifyProduct, shopDomain: string): CatalogProduct {
  const variant = product.variants?.[0];
  const sku = variant?.sku?.trim() || `shopify-${product.id}`;
  const price = parseFloat(variant?.price ?? "0") || 0;
  const images = (product.images ?? [])
    .map((img) => img.src)
    .filter((src): src is string => Boolean(src));
  const primaryImage = product.image?.src ?? images[0];
  const inStock =
    variant?.inventory_quantity == null
      ? product.status === "active"
      : (variant.inventory_quantity ?? 0) > 0;

  return {
    sku,
    name: product.title,
    description: stripHtml(product.body_html || product.title),
    price,
    category: product.product_type?.trim() || product.vendor?.trim() || "General",
    imageUrl: primaryImage,
    imageUrls: images.length ? images : undefined,
    tags: product.tags?.trim() || undefined,
    inStock,
    url: `https://${shopDomain}/products/${product.handle}`,
  };
}

async function findShopifySourceId(tenantId: string, config: CoreConfig): Promise<string | null> {
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
  });
}

export async function connectShopifyStore(
  auth: AuthContext,
  body: ConnectShopifyBody,
  config: CoreConfig
) {
  const creds = validateConnectShopifyBody(body);
  const shop = await fetchShopifyShop(creds, config);

  await saveShopifyCredentials(auth.tenantId, creds, config);
  const sourceId = await ensureShopifySource(auth, creds.shopDomain, config);

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
    },
    config
  );

  return ok({
    connected: true,
    shopDomain: creds.shopDomain,
    storeName: shop.name,
    planName: shop.plan_name,
    sourceId,
  });
}

export async function disconnectShopifyStore(auth: AuthContext, config: CoreConfig) {
  await deleteShopifyCredentials(auth.tenantId, config);

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
