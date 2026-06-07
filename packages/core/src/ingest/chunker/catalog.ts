import { generateId } from "@commercechat/shared";
import type { CatalogProduct } from "../parsers/catalog-csv";
import type { ChunkMetadata, VectorChunk } from "../types";

export function catalogProductToText(product: CatalogProduct): string {
  const parts = [
    product.name,
    product.category,
    product.description,
    `$${product.price.toFixed(2)}`,
    `SKU: ${product.sku}`,
  ];
  if (product.sizes) parts.push(`Sizes: ${product.sizes}`);
  if (product.colors) parts.push(`Colors: ${product.colors}`);
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
      section: product.category,
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
