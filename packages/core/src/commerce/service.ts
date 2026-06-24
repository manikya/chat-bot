import { ok, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import {
  listCatalogSearchHints,
  listProductItems,
  productCategoryList,
  regenerateProductAttributes,
  searchProductCache,
  splitProductRelationship,
  type ProductRecord,
} from "../catalog/products";

type ProductCacheRecord = ProductRecord & { sourceId?: string; updatedAt?: string };

function toProductListItem(item: ProductCacheRecord) {
  return {
    sku: item.sku,
    name: item.name,
    description: item.description,
    price: item.price,
    currency: item.currency,
    category: item.category,
    categories: productCategoryList(item),
    inStock: item.inStock !== false,
    imageUrl: item.imageUrl,
    imageUrls: item.imageUrls,
    productUrl: item.productUrl,
    tags: splitProductRelationship(item.tags),
    material: splitProductRelationship(item.material),
    occasion: splitProductRelationship(item.occasion),
    recipient: splitProductRelationship(item.recipient),
    compatibility: splitProductRelationship(item.compatibility),
    bundles: splitProductRelationship(item.bundles),
    variants: item.variants,
    sourceId: item.sourceId,
    updatedAt: item.updatedAt,
  };
}

function buildCategorySummary(items: ProductRecord[]) {
  const categories = new Map<string, { name: string; productCount: number; inStockCount: number; sampleSkus: string[] }>();
  for (const item of items) {
    for (const category of productCategoryList(item)) {
      const name = category.trim();
      if (!name) continue;
      const entry = categories.get(name) ?? { name, productCount: 0, inStockCount: 0, sampleSkus: [] };
      entry.productCount += 1;
      if (item.inStock !== false) entry.inStockCount += 1;
      if (entry.sampleSkus.length < 5) entry.sampleSkus.push(item.sku);
      categories.set(name, entry);
    }
  }
  return [...categories.values()].sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name));
}

export async function listCommerceProducts(
  auth: AuthContext,
  config: CoreConfig,
  options?: { q?: string; limit?: number }
) {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 500);
  const query = options?.q?.trim() ?? "";
  const allItems = (await listProductItems(auth.tenantId, config)) as ProductCacheRecord[];
  const catalogHints = await listCatalogSearchHints(auth.tenantId, config);

  const records = query ? await searchProductCache(auth.tenantId, query, config, { limit }) : allItems.slice(0, limit);
  const sourceIds = [...new Set(allItems.map((item) => item.sourceId).filter((value): value is string => Boolean(value)))];

  return ok({
    items: records.map(toProductListItem),
    total: allItems.length,
    returned: records.length,
    categories: buildCategorySummary(allItems),
    generated: {
      priceBands: catalogHints.priceBands,
      tags: catalogHints.tags,
      materials: catalogHints.materials,
      occasions: catalogHints.occasions,
      recipients: catalogHints.recipients,
      useCases: catalogHints.useCases,
      styles: catalogHints.styles,
      occasionRecipients: catalogHints.occasionRecipients,
      relatedByCategory: catalogHints.relatedByCategory,
    },
    sources: sourceIds.map((sourceId) => ({
      sourceId,
      productCount: allItems.filter((item) => item.sourceId === sourceId).length,
    })),
  });
}

export async function regenerateCommerceProductAttributes(auth: AuthContext, config: CoreConfig) {
  const result = await regenerateProductAttributes(auth.tenantId, config);
  const catalogHints = await listCatalogSearchHints(auth.tenantId, config);
  return ok({
    ...result,
    generated: {
      tags: catalogHints.tags,
      materials: catalogHints.materials,
      occasions: catalogHints.occasions,
      recipients: catalogHints.recipients,
      useCases: catalogHints.useCases,
      styles: catalogHints.styles,
      priceBands: catalogHints.priceBands,
    },
  });
}
