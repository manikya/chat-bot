import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  ApiError,
  ErrorCodes,
  generateId,
  ok,
  type AuthContext,
} from "@commercechat/shared";
import type { CoreConfig } from "../../config";
import { getDocClient } from "../../db/client";
import { Keys } from "../../db/keys";
import { getTenantConfig, updateTenantConfig } from "../../tenant/service";
import type { CatalogProduct } from "../../ingest/parsers/catalog-csv";
import {
  deleteWordPressCredentials,
  loadWordPressCredentials,
  saveWordPressCredentials,
} from "./credentials";
import {
  fetchAllWordPressProducts,
  fetchWordPressOrder,
  fetchWordPressOrdersByPhone,
  fetchWordPressStatus,
  validateConnectBody,
} from "./client";
import type { ConnectWordPressBody, WordPressOrder, WordPressProduct } from "./types";

const WOOCOMMERCE_SOURCE_NAME = "WooCommerce store";

export function wordPressProductToCatalog(product: WordPressProduct): CatalogProduct {
  const attrs = product.attributes
    .map((a) => `${a.name}: ${a.options.join(", ")}`)
    .join("; ");
  const tags = product.tags?.join(", ");
  const images = product.images?.length
    ? product.images
    : product.image
      ? [product.image]
      : [];

  return {
    sku: product.sku,
    name: product.name,
    description: product.rag_text || product.short_description || product.description,
    price: product.price,
    category: product.categories[0] ?? "General",
    imageUrl: product.image ?? undefined,
    imageUrls: images.length ? images : undefined,
    inStock: product.stock_status === "instock",
    url: product.permalink,
    sizes: attrs || undefined,
    tags: tags || undefined,
  };
}

export function formatOrderForChat(order: WordPressOrder): Record<string, unknown> {
  const items = order.line_items
    .map((li) => `${li.quantity}× ${li.name}`)
    .join(", ");
  return {
    orderId: order.number,
    status: order.status,
    statusLabel: order.status_label,
    total: order.total,
    currency: order.currency,
    createdAt: order.created_at,
    items,
    message: `Order #${order.number} is ${order.status_label.toLowerCase()} (${order.currency} ${order.total}). Items: ${items}.`,
  };
}

async function findWooCommerceSourceId(tenantId: string, config: CoreConfig): Promise<string | null> {
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
        ":t": "woocommerce",
        ":d": "deleted",
      },
    })
  );
  const item = res.Items?.[0];
  return item ? (item.sourceId as string) : null;
}

async function ensureWooCommerceSource(
  auth: AuthContext,
  siteUrl: string,
  config: CoreConfig
): Promise<string> {
  const existing = await findWooCommerceSourceId(auth.tenantId, config);
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
        type: "woocommerce",
        name: WOOCOMMERCE_SOURCE_NAME,
        status: "active",
        chunkCount: 0,
        vectorCount: 0,
        config: { siteUrl },
        createdAt: now,
        updatedAt: now,
      },
    })
  );

  return sourceId;
}

export async function getWordPressConnectorStatus(auth: AuthContext, config: CoreConfig) {
  const tenantConfig = await getTenantConfig(auth, config);
  const connector = tenantConfig.data!.commerceConnector;
  const creds = await loadWordPressCredentials(auth.tenantId, config);
  const sourceId = await findWooCommerceSourceId(auth.tenantId, config);

  return ok({
    connected: connector.type === "woocommerce" && connector.status === "connected" && Boolean(creds),
    siteUrl: creds?.siteUrl ?? (connector as { siteUrl?: string }).siteUrl,
    lastSyncAt: (connector as { lastSyncAt?: string }).lastSyncAt,
    sourceId,
  });
}

export async function connectWordPressStore(
  auth: AuthContext,
  body: ConnectWordPressBody,
  config: CoreConfig
) {
  const creds = validateConnectBody(body.siteUrl, body.apiKey);
  const status = await fetchWordPressStatus(creds, config);

  await saveWordPressCredentials(auth.tenantId, creds, config);

  const sourceId = await ensureWooCommerceSource(auth, creds.siteUrl, config);

  await updateTenantConfig(
    auth,
    {
      commerceConnector: {
        type: "woocommerce",
        status: "connected",
        checkoutBaseUrl: creds.siteUrl,
        siteUrl: creds.siteUrl,
        storeName: status.site_name,
        currency: status.currency ?? undefined,
        lastSyncAt: undefined,
      },
    },
    config
  );

  return ok({
    connected: true,
    siteUrl: creds.siteUrl,
    storeName: status.site_name,
    woocommerceVersion: status.woocommerce_version,
    sourceId,
  });
}

export async function disconnectWordPressStore(auth: AuthContext, config: CoreConfig) {
  await deleteWordPressCredentials(auth.tenantId, config);

  const sourceId = await findWooCommerceSourceId(auth.tenantId, config);
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

export type WordPressOrderLookupResult =
  | { found: true; order: Record<string, unknown> }
  | { found: true; orders: Record<string, unknown>[] }
  | { found: false; message: string };

export async function lookupWordPressOrder(
  tenantId: string,
  config: CoreConfig,
  options: { orderId?: string; phone?: string }
): Promise<WordPressOrderLookupResult> {
  const creds = await loadWordPressCredentials(tenantId, config);
  if (!creds) {
    return { found: false as const, message: "WooCommerce store is not connected." };
  }

  if (options.orderId) {
    const id = parseInt(options.orderId.replace(/\D/g, ""), 10);
    if (!id) {
      return { found: false as const, message: "Invalid order ID." };
    }
    try {
      const order = await fetchWordPressOrder(creds, config, id);
      return { found: true as const, order: formatOrderForChat(order) };
    } catch {
      return { found: false as const, message: `Order #${options.orderId} was not found.` };
    }
  }

  if (options.phone) {
    const { orders } = await fetchWordPressOrdersByPhone(creds, config, options.phone, 3);
    if (!orders.length) {
      return {
        found: false as const,
        message: "No recent orders found for this phone number.",
      };
    }
    if (orders.length === 1) {
      return { found: true, order: formatOrderForChat(orders[0]!) };
    }
    return { found: true, orders: orders.map(formatOrderForChat) };
  }

  return { found: false as const, message: "Provide an order ID or phone number." };
}

export async function fetchWordPressCatalogProducts(
  tenantId: string,
  config: CoreConfig,
  since?: string
): Promise<CatalogProduct[]> {
  const creds = await loadWordPressCredentials(tenantId, config);
  if (!creds) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "WooCommerce store is not connected", 400);
  }
  const items = await fetchAllWordPressProducts(creds, config, since);
  return items.map(wordPressProductToCatalog);
}

export async function touchWordPressSyncTimestamp(auth: AuthContext, config: CoreConfig) {
  const tenantConfig = await getTenantConfig(auth, config);
  const connector = tenantConfig.data!.commerceConnector;
  if (connector.type !== "woocommerce") return;

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
