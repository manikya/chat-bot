import { generateId } from "@commercechat/shared";
import type { CatalogProduct } from "../parsers/catalog-csv";
import type { ChunkMetadata, VectorChunk } from "../types";

function splitRelationshipList(value?: string): string[] | undefined {
  return value
    ?.split(/[,|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

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
  if (product.material) parts.push(`Materials: ${product.material}`);
  if (product.occasion) parts.push(`Occasions: ${product.occasion}`);
  if (product.recipient) parts.push(`Recipients: ${product.recipient}`);
  if (product.compatibility) parts.push(`Compatible with: ${product.compatibility}`);
  if (product.bundles) parts.push(`Bundles with: ${product.bundles}`);
  if (product.duration) parts.push(`Duration: ${product.duration}`);
  if (product.location) parts.push(`Location: ${product.location}`);
  if (product.bookingType) parts.push(`Booking type: ${product.bookingType}`);
  if (product.packageIncludes) parts.push(`Includes: ${product.packageIncludes}`);
  if (product.availability) parts.push(`Availability: ${product.availability}`);
  if (product.staffRole) parts.push(`Staff role: ${product.staffRole}`);
  if (product.serviceArea) parts.push(`Service area: ${product.serviceArea}`);
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
      material: splitRelationshipList(product.material),
      occasion: splitRelationshipList(product.occasion),
      recipient: splitRelationshipList(product.recipient),
      compatibility: splitRelationshipList(product.compatibility),
      bundles: splitRelationshipList(product.bundles),
      duration: product.duration,
      location: product.location,
      bookingType: product.bookingType,
      packageIncludes: product.packageIncludes,
      availability: product.availability,
      staffRole: product.staffRole,
      serviceArea: product.serviceArea,
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
