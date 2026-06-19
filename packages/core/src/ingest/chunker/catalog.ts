import { generateId } from "@commercechat/shared";
import type { CatalogProduct } from "../parsers/catalog-csv";
import type { ChunkMetadata, VectorChunk } from "../types";

export function catalogProductToText(product: CatalogProduct): string {
  const categoryText =
    product.categories?.length ? product.categories.join(", ") : product.category;
  const parts = [
    product.name,
    categoryText ? `Categories: ${categoryText}` : null,
    product.description,
    `${product.currency ?? "USD"} ${product.price.toFixed(2)}`,
    `SKU: ${product.sku}`,
  ].filter(Boolean);
  if (product.sizes) parts.push(`Sizes: ${product.sizes}`);
  if (product.colors) parts.push(`Colors: ${product.colors}`);
  if (product.tags) parts.push(`Tags: ${product.tags}`);
  if (product.url) parts.push(`URL: ${product.url}`);
  if (product.imageUrl) parts.push(`Image: ${product.imageUrl}`);
  if (product.imageUrls?.length) parts.push(`Images: ${product.imageUrls.join(", ")}`);
  return parts.join(" | ");
}

export function chunkCatalogProducts(
  sourceId: string,
  products: CatalogProduct[],
  syncedAt: string
): Array<{ text: string; metadata: ChunkMetadata }> {
  return products.map((product) => ({
    text: catalogProductToText(product),
    metadata: {
      source_type: "catalog",
      sku: product.sku,
      title: product.name,
      section: product.categories?.length ? product.categories.join(", ") : product.category,
      categories: product.categories?.length ? product.categories : [product.category],
      price: product.price,
      currency: product.currency,
      inStock: product.inStock,
      tags: product.tags
        ?.split(/[,|;]/)
        .map((t) => t.trim())
        .filter(Boolean),
      url: product.url,
      crawled_at: syncedAt,
    },
  }));
}

export function toCatalogVectorChunks(
  sourceId: string,
  drafts: Array<{ text: string; metadata: ChunkMetadata }>,
  embeddings: number[][]
): VectorChunk[] {
  return drafts.map((draft, i) => ({
    id: generateId("chk_"),
    sourceId,
    text: draft.text,
    embedding: embeddings[i]!,
    metadata: draft.metadata,
  }));
}
