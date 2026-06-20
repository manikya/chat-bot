import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import type { CatalogProduct } from "../ingest/parsers/catalog-csv";
import { notifyWishlistRemindersForProducts } from "../chat/wishlist";
import {
  categoryFilterMatches,
  productCategoryList,
  productMatchReasons,
  rankProductsByRelevance,
  searchTermsFromQuery,
  scoreProductRelevance,
} from "./product-search";

export async function getStoreCurrency(tenantId: string, config: CoreConfig): Promise<string> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.config() },
    })
  );
  const connector = res.Item?.commerceConnector as { currency?: string } | undefined;
  return connector?.currency ?? "USD";
}

export async function listProductItems(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": "PRODUCT#",
      },
    })
  );
  return res.Items ?? [];
}

export async function upsertProductCache(
  tenantId: string,
  sourceId: string,
  products: CatalogProduct[],
  config: CoreConfig
) {
  const db = getDocClient(config);
  const now = new Date().toISOString();
  const fallbackCurrency = await getStoreCurrency(tenantId, config);
  for (const product of products) {
    await db.send(
      new PutCommand({
        TableName: config.tableName,
        Item: {
          PK: Keys.tenantPk(tenantId),
          SK: Keys.product(product.sku),
          sku: product.sku,
          sourceId,
          name: product.name,
          description: product.description,
          price: product.price,
          currency: product.currency ?? fallbackCurrency,
          category: product.category,
          categories: product.categories?.length ? product.categories : undefined,
          inStock: product.inStock,
          imageUrl: product.imageUrl,
          imageUrls: product.imageUrls,
          productUrl: product.url,
          tags: product.tags,
          variants: [product.sizes, product.colors].filter(Boolean).join("; ") || undefined,
          updatedAt: now,
        },
      })
    );
  }
  try {
    const result = await notifyWishlistRemindersForProducts(tenantId, products, config);
    if (result.notified || result.waiting) {
      console.log("[wishlist] stock reminders processed", result);
    }
  } catch (err) {
    console.warn(
      "[wishlist] failed to process stock reminders",
      err instanceof Error ? err.message : err
    );
  }
}

export async function deleteProductsForSource(
  tenantId: string,
  sourceId: string,
  config: CoreConfig
) {
  const items = await listProductItems(tenantId, config);
  const db = getDocClient(config);
  const toDelete = items.filter((item) => item.sourceId === sourceId);
  for (const item of toDelete) {
    await db.send(
      new DeleteCommand({
        TableName: config.tableName,
        Key: { PK: item.PK, SK: item.SK },
      })
    );
  }
  return toDelete.length;
}

export interface ProductRecord {
  sku: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  category?: string;
  categories?: string[];
  inStock: boolean;
  imageUrl?: string;
  imageUrls?: string[];
  productUrl?: string;
  tags?: string;
  variants?: string;
}

export async function getProductBySku(
  tenantId: string,
  sku: string,
  config: CoreConfig
): Promise<ProductRecord | null> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.product(sku) },
    })
  );
  if (!res.Item) return null;
  return res.Item as ProductRecord;
}

export async function getRelatedProducts(
  tenantId: string,
  config: CoreConfig,
  options?: { sku?: string; category?: string; excludeSkus?: string[]; limit?: number }
): Promise<ProductRecord[]> {
  const limit = options?.limit ?? 5;
  const exclude = new Set((options?.excludeSkus ?? []).map((s) => s.toUpperCase()));
  let categoryHints: string[] = [];

  if (options?.sku) {
    exclude.add(options.sku.toUpperCase());
    const base = await getProductBySku(tenantId, options.sku, config);
    if (base) categoryHints = productCategoryList(base).map((c) => c.toLowerCase());
  } else if (options?.category) {
    categoryHints = [options.category.toLowerCase()];
  }

  const items = (await listProductItems(tenantId, config)) as ProductRecord[];
  const inCategory = items.filter((p) => {
    if (exclude.has(p.sku.toUpperCase())) return false;
    if (!categoryHints.length) return true;
    return categoryHints.some((hint) => categoryFilterMatches(p, hint));
  });

  const picked = inCategory.slice(0, limit);
  if (picked.length >= limit) return picked;

  const seen = new Set(picked.map((p) => p.sku));
  for (const p of items) {
    if (picked.length >= limit) break;
    if (exclude.has(p.sku.toUpperCase()) || seen.has(p.sku)) continue;
    picked.push(p);
    seen.add(p.sku);
  }
  return picked.slice(0, limit);
}

export async function searchProductCache(
  tenantId: string,
  query: string,
  config: CoreConfig,
  options?: { category?: string; maxPrice?: number; minPrice?: number; limit?: number }
): Promise<ProductRecord[]> {
  const items = (await listProductItems(tenantId, config)) as ProductRecord[];
  const limit = options?.limit ?? 5;
  return rankProductsByRelevance(items, query, { ...options, limit });
}

export async function listCatalogSearchHints(
  tenantId: string,
  config: CoreConfig
): Promise<{ categories: string[]; tags: string[] }> {
  const items = (await listProductItems(tenantId, config)) as ProductRecord[];
  const categories = new Set<string>();
  const tags = new Set<string>();

  for (const item of items) {
    for (const category of productCategoryList(item)) {
      const trimmed = category.trim();
      if (trimmed) categories.add(trimmed);
    }
    for (const tag of (item.tags ?? "").split(/[,|;]/)) {
      const trimmed = tag.trim();
      if (trimmed) tags.add(trimmed);
    }
  }

  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    tags: [...tags].sort((a, b) => a.localeCompare(b)),
  };
}

export {
  productCategoryList,
  productMatchReasons,
  searchTermsFromQuery,
  scoreProductRelevance,
  rankProductsByRelevance,
};
