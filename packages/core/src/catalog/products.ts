import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import type { CatalogProduct } from "../ingest/parsers/catalog-csv";

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

export async function searchProductCache(
  tenantId: string,
  query: string,
  config: CoreConfig,
  options?: { category?: string; maxPrice?: number; minPrice?: number; limit?: number }
): Promise<ProductRecord[]> {
  const items = await listProductItems(tenantId, config);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const limit = options?.limit ?? 5;

  const scored = items
    .map((item) => {
      const record = item as ProductRecord;
      const haystack = [record.name, record.description, record.category, record.sku, record.variants]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchCount = terms.filter((t) => haystack.includes(t)).length;
      return { record, matchCount };
    })
    .filter(({ record, matchCount }) => {
      if (matchCount === 0 && terms.length > 0) return false;
      if (options?.category && record.category?.toLowerCase() !== options.category.toLowerCase()) {
        return false;
      }
      if (options?.maxPrice != null && record.price > options.maxPrice) return false;
      if (options?.minPrice != null && record.price < options.minPrice) return false;
      return true;
    })
    .sort((a, b) => b.matchCount - a.matchCount);

  return scored.slice(0, limit).map((s) => s.record);
}
