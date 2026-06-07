import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import type { CatalogProduct } from "../ingest/parsers/catalog-csv";

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
          currency: "USD",
          category: product.category,
          inStock: product.inStock,
          imageUrl: product.imageUrl,
          productUrl: product.url,
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
