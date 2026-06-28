import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import type { CatalogProduct } from "../ingest/parsers/catalog-csv";
import { notifyWishlistRemindersForProducts } from "../chat/wishlist";
import { createLLMProvider } from "../llm/provider";
import type { ChatRequest, ResponseFormat } from "../llm/types";
import {
  categoryFilterMatches,
  productCategoryList,
  productMatchReasons,
  productRelationshipTerms,
  rankProductsByRelevance,
  searchTermsFromQuery,
  scoreProductRelevance,
  splitProductRelationship,
} from "./product-search";

const CATALOG_INTELLIGENCE_RESPONSE_FORMAT: ResponseFormat = {
  type: "json_schema",
  jsonSchema: {
    name: "catalog_offering_intelligence",
    strict: false,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        offeringMode: { enum: ["products", "services", "mixed", "unknown"] },
        offeringTypes: {
          type: "array",
          items: { type: "string" },
        },
        useCaseProfiles: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            properties: {
              terms: {
                type: "array",
                items: { type: "string" },
              },
              audiences: {
                type: "array",
                items: { type: "string" },
              },
              decisionFactors: {
                type: "array",
                items: { type: "string" },
              },
              offeringTypes: {
                type: "array",
                items: { type: "string" },
              },
              priceCoverage: {
                type: "object",
                additionalProperties: false,
                properties: {
                  min: { type: "number" },
                  max: { type: "number" },
                  currency: { type: "string" },
                },
              },
            },
          },
        },
        audiences: {
          type: "array",
          items: { type: "string" },
        },
        decisionFactors: {
          type: "array",
          items: { type: "string" },
        },
        starterIntents: {
          type: "array",
          items: { type: "string" },
        },
        confidence: { type: "number" },
        sourceEvidence: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
};

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
          material: product.material,
          occasion: product.occasion,
          recipient: product.recipient,
          compatibility: product.compatibility,
          bundles: product.bundles,
          variants: [product.sizes, product.colors].filter(Boolean).join("; ") || undefined,
          duration: product.duration,
          location: product.location,
          bookingType: product.bookingType,
          packageIncludes: product.packageIncludes,
          availability: product.availability,
          staffRole: product.staffRole,
          serviceArea: product.serviceArea,
          updatedAt: now,
        },
      })
    );
  }
  clearCatalogSearchHintsCache(tenantId);
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
  if (toDelete.length) clearCatalogSearchHintsCache(tenantId);
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
  material?: string;
  occasion?: string;
  recipient?: string;
  compatibility?: string;
  bundles?: string;
  variants?: string;
  duration?: string;
  location?: string;
  bookingType?: string;
  packageIncludes?: string;
  availability?: string;
  staffRole?: string;
  serviceArea?: string;
}

export interface CatalogPriceBand {
  label: string;
  message: string;
  min?: number;
  max?: number;
}

export interface CatalogPriceCoverage {
  min?: number;
  max?: number;
  count: number;
  inStockCount: number;
  currency: string;
}

export interface CatalogProductTypeHint {
  term: string;
  source: "category" | "material" | "occasion" | "use_case";
  productCount: number;
  inStockCount: number;
  priceCoverage?: CatalogPriceCoverage;
  topSkus: string[];
}

export interface CatalogGiftProfile {
  recipients: string[];
  styles: string[];
  useCases: string[];
  categories: string[];
  priceCoverage?: CatalogPriceCoverage;
}

export interface CatalogAttributeSummary {
  materials: string[];
  styles: string[];
  useCases: string[];
  variants: string[];
  priceCoverage?: CatalogPriceCoverage;
  topSkus: string[];
}

export type CatalogOfferingMode = "products" | "services" | "mixed" | "unknown";

export interface CatalogUseCaseProfile {
  terms: string[];
  audiences: string[];
  decisionFactors: string[];
  offeringTypes: string[];
  priceCoverage?: CatalogPriceCoverage;
}

export interface CatalogOfferingIntelligence {
  offeringMode: CatalogOfferingMode;
  offeringTypes: string[];
  useCaseProfiles: Record<string, CatalogUseCaseProfile>;
  audiences: string[];
  decisionFactors: string[];
  starterIntents: string[];
  quality?: { score: number; warnings: string[] };
  model?: string;
  confidence?: number;
  sourceEvidence?: string[];
  generatedAt?: string;
}

export interface CatalogSearchHints {
  categories: string[];
  tags: string[];
  materials: string[];
  occasions: string[];
  recipients: string[];
  useCases: string[];
  styles: string[];
  priceBands: CatalogPriceBand[];
  priceBandsByCategory: Record<string, CatalogPriceBand[]>;
  priceBandsByMaterial: Record<string, CatalogPriceBand[]>;
  aliases: Record<string, string[]>;
  occasionRecipients: Record<string, string[]>;
  relatedByCategory: Record<string, string[]>;
  priceCoverageByCategory: Record<string, CatalogPriceCoverage>;
  priceCoverageByMaterial: Record<string, CatalogPriceCoverage>;
  productTypeHints: CatalogProductTypeHint[];
  giftProfiles: Record<string, CatalogGiftProfile>;
  attributeSummaries: Record<string, CatalogAttributeSummary>;
  offeringMode: CatalogOfferingMode;
  offeringTypes: string[];
  useCaseProfiles: Record<string, CatalogUseCaseProfile>;
  audiences: string[];
  decisionFactors: string[];
  starterIntents: string[];
  intelligenceQuality?: { score: number; warnings: string[] };
  intelligenceGeneratedAt?: string;
  intelligenceModel?: string;
}

const CATALOG_HINTS_CACHE_TTL_MS = 5 * 60 * 1000;
const catalogHintsCache = new Map<string, { expiresAt: number; hints: CatalogSearchHints }>();

function clearCatalogSearchHintsCache(tenantId: string) {
  catalogHintsCache.delete(tenantId);
}

function mostCommonCurrency(items: Array<{ currency?: string }>): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const currency = item.currency?.trim().toUpperCase();
    if (!currency) continue;
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
}

function percentile(values: number[], point: number): number {
  if (!values.length) return 0;
  if (values.length === 1) return values[0]!;
  const index = (values.length - 1) * point;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower]!;
  const weight = index - lower;
  return values[lower]! * (1 - weight) + values[upper]! * weight;
}

function nicePriceStep(amount: number, currency: string): number {
  if (currency === "LKR") {
    if (amount < 1_000) return 100;
    if (amount < 5_000) return 500;
    if (amount < 20_000) return 1_000;
    if (amount < 100_000) return 5_000;
    return 10_000;
  }
  if (amount < 50) return 5;
  if (amount < 200) return 10;
  if (amount < 1_000) return 50;
  if (amount < 5_000) return 100;
  return 500;
}

function roundNicePrice(amount: number, currency: string): number {
  const step = nicePriceStep(amount, currency);
  return Math.max(step, Math.round(amount / step) * step);
}

function roundNicePriceAtLeast(amount: number, currency: string): number {
  const step = nicePriceStep(amount, currency);
  return Math.max(step, Math.ceil(amount / step) * step);
}

function roundNicePriceAtMost(amount: number, currency: string): number {
  const step = nicePriceStep(amount, currency);
  return Math.max(step, Math.floor(amount / step) * step);
}

function countAtOrBelow(values: number[], max: number): number {
  return values.filter((value) => value <= max).length;
}

function countBetween(values: number[], min: number, max: number): number {
  return values.filter((value) => value > min && value <= max).length;
}

const MATERIAL_TERMS = [
  "ceramic",
  "clay",
  "airdry clay",
  "epoxy",
  "resin",
  "wood",
  "wooden",
  "glass",
  "metal",
  "brass",
  "silver",
  "gold",
  "fabric",
  "cotton",
  "paper",
];

const OCCASION_TERMS = [
  "christmas",
  "new year",
  "valentine",
  "birthday",
  "anniversary",
  "wedding",
  "housewarming",
  "father's day",
  "fathers day",
  "mother's day",
  "mothers day",
  "corporate event",
  "event",
];

const RECIPIENT_TERMS = [
  "dad",
  "father",
  "husband",
  "grandpa",
  "mom",
  "mother",
  "wife",
  "grandma",
  "friend",
  "kids",
  "children",
];

const USE_CASE_TERMS = [
  "home decor",
  "decoration",
  "decor",
  "gift",
  "gifting",
  "table decor",
  "giveaway",
  "appreciation",
  "award",
  "collectible",
  "figurine",
  "display",
];

const STYLE_TERMS = [
  "festive",
  "minimal",
  "decorative",
  "cute",
  "mini",
  "premium",
  "personalized",
  "handmade",
  "christmas",
  "ceramic",
];

function textContainsTerm(text: string, term: string): boolean {
  return new RegExp(`(^|\\W)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`, "i").test(text);
}

function addTermsFromText(target: Set<string>, text: string, terms: string[]) {
  for (const term of terms) {
    if (textContainsTerm(text, term)) target.add(term.replace(/\b\w/g, (char) => char.toUpperCase()));
  }
}

function inferProductAttributes(item: ProductRecord) {
  const categories = productCategoryList(item);
  const text = [item.name, item.description, item.category, ...categories, item.tags, item.material, item.occasion, item.recipient, item.compatibility]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const tags = new Set(splitProductRelationship(item.tags));
  const materials = new Set(splitProductRelationship(item.material));
  const occasions = new Set(splitProductRelationship(item.occasion));
  const recipients = new Set(splitProductRelationship(item.recipient));
  const compatibility = new Set(splitProductRelationship(item.compatibility));

  for (const category of categories) {
    if (category) tags.add(category);
  }
  addTermsFromText(materials, text, MATERIAL_TERMS);
  addTermsFromText(occasions, text, OCCASION_TERMS);
  addTermsFromText(recipients, text, RECIPIENT_TERMS);
  addTermsFromText(compatibility, text, USE_CASE_TERMS);
  addTermsFromText(tags, text, STYLE_TERMS);

  if (textContainsTerm(text, "christmas")) {
    tags.add("Festive");
    compatibility.add("Home decor");
    compatibility.add("Gift");
  }
  if (textContainsTerm(text, "angel") || textContainsTerm(text, "santa") || textContainsTerm(text, "ornament")) {
    compatibility.add("Home decor");
    tags.add("Decorative");
  }

  return {
    tags: [...tags].filter(Boolean).join(", ") || undefined,
    material: [...materials].filter(Boolean).join(", ") || undefined,
    occasion: [...occasions].filter(Boolean).join(", ") || undefined,
    recipient: [...recipients].filter(Boolean).join(", ") || undefined,
    compatibility: [...compatibility].filter(Boolean).join(", ") || undefined,
  };
}

export function buildCatalogPriceBands(
  items: Array<{ price: number; currency?: string; inStock?: boolean }>
): CatalogPriceBand[] {
  const inStock = items
    .filter((p) => p.inStock !== false && Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => a.price - b.price);
  if (!inStock.length) return [];
  const currency = mostCommonCurrency(inStock);
  const format = (amount: number) => {
    try {
      return new Intl.NumberFormat(currency === "LKR" ? "en-LK" : "en", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency} ${Math.round(amount)}`;
    }
  };
  const prices = inStock.map((item) => item.price);
  const max = prices[prices.length - 1]!;
  const trim = prices.length >= 20 ? Math.floor(prices.length * 0.05) : 0;
  const robustPrices = trim > 0 ? prices.slice(trim, prices.length - trim) : prices;
  const minProductsPerBand = prices.length >= 9 ? 2 : 1;
  let lowCutoff = roundNicePrice(percentile(robustPrices, 0.4), currency);
  let highCutoff = roundNicePriceAtLeast(percentile(robustPrices, 0.82), currency);

  if (countAtOrBelow(prices, lowCutoff) < minProductsPerBand) {
    lowCutoff = roundNicePriceAtLeast(prices[minProductsPerBand - 1] ?? prices[0]!, currency);
  }
  if (highCutoff <= lowCutoff || countBetween(prices, lowCutoff, highCutoff) < minProductsPerBand) {
    const fallbackIndex = Math.min(prices.length - 1, Math.max(minProductsPerBand, Math.floor((prices.length - 1) * 0.8)));
    highCutoff = roundNicePriceAtLeast(prices[fallbackIndex]!, currency);
  }
  if (highCutoff >= max && prices.length > 1) {
    highCutoff = roundNicePriceAtMost(prices[prices.length - 2]!, currency);
  }

  const bands: CatalogPriceBand[] = [
    {
      label: `Budget friendly: under ${format(lowCutoff)}`,
      message: `Show budget friendly options under ${format(lowCutoff)}`,
      max: lowCutoff,
    },
  ];
  if (highCutoff > lowCutoff && countBetween(prices, lowCutoff, highCutoff) > 0) {
    bands.push({
      label: `Mid range: ${format(lowCutoff)}-${format(highCutoff)}`,
      message: `Show mid range options from ${format(lowCutoff)} to ${format(highCutoff)}`,
      min: lowCutoff,
      max: highCutoff,
    });
  }
  if (max > highCutoff) {
    bands.push({
      label: `Premium picks: above ${format(highCutoff)}`,
      message: `Show premium options above ${format(highCutoff)}`,
      min: highCutoff,
    });
  }
  return bands.slice(0, 3);
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
  let baseProduct: ProductRecord | null = null;

  if (options?.sku) {
    exclude.add(options.sku.toUpperCase());
    baseProduct = await getProductBySku(tenantId, options.sku, config);
    if (baseProduct) categoryHints = productCategoryList(baseProduct).map((c) => c.toLowerCase());
  } else if (options?.category) {
    categoryHints = [options.category.toLowerCase()];
  }

  const items = (await listProductItems(tenantId, config)) as ProductRecord[];
  const baseTerms = new Set(productRelationshipTerms(baseProduct ?? ({} as ProductRecord)).map((t) => t.toLowerCase()));
  const baseTags = new Set(splitProductRelationship(baseProduct?.tags).map((t) => t.toLowerCase()));
  const baseBundles = new Set(splitProductRelationship(baseProduct?.bundles).map((t) => t.toUpperCase()));
  const scored = items
    .filter((p) => !exclude.has(p.sku.toUpperCase()))
    .map((p) => {
      let score = 0;
      if (categoryHints.some((hint) => categoryFilterMatches(p, hint))) score += 8;
      if (baseBundles.has(p.sku.toUpperCase())) score += 12;

      const relatedTerms = productRelationshipTerms(p).map((t) => t.toLowerCase());
      for (const term of relatedTerms) {
        if (baseTerms.has(term)) score += 5;
      }
      for (const tag of splitProductRelationship(p.tags).map((t) => t.toLowerCase())) {
        if (baseTags.has(tag)) score += 3;
      }
      if (options?.category && categoryFilterMatches(p, options.category)) score += 8;
      if (p.inStock !== false) score += 2;
      if (p.imageUrl || p.imageUrls?.length) score += 1;
      return { product: p, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.product.inStock !== b.product.inStock) return a.product.inStock === false ? 1 : -1;
      return b.product.price - a.product.price;
    });

  return scored.slice(0, limit).map((item) => item.product);
}

export async function searchProductCache(
  tenantId: string,
  query: string,
  config: CoreConfig,
  options?: {
    category?: string;
    requiredTerms?: string[];
    maxPrice?: number;
    minPrice?: number;
    limit?: number;
    excludeSkus?: string[];
  }
): Promise<ProductRecord[]> {
  const items = (await listProductItems(tenantId, config)) as ProductRecord[];
  const limit = options?.limit ?? 5;
  return rankProductsByRelevance(items, query, { ...options, limit });
}

export async function regenerateProductAttributes(
  tenantId: string,
  config: CoreConfig,
  options?: { catalogIntelligenceModel?: string }
): Promise<{ updated: number; total: number; intelligenceModel?: string; intelligenceConfidence?: number }> {
  const items = (await listProductItems(tenantId, config)) as Array<ProductRecord & { PK: string; SK: string }>;
  const db = getDocClient(config);
  const now = new Date().toISOString();
  let updated = 0;

  for (const item of items) {
    const inferred = inferProductAttributes(item);
    const next = {
      tags: item.tags || inferred.tags,
      material: item.material || inferred.material,
      occasion: item.occasion || inferred.occasion,
      recipient: item.recipient || inferred.recipient,
      compatibility: item.compatibility || inferred.compatibility,
    };
    const changed =
      next.tags !== item.tags ||
      next.material !== item.material ||
      next.occasion !== item.occasion ||
      next.recipient !== item.recipient ||
      next.compatibility !== item.compatibility;
    if (!changed) continue;

    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression:
          "SET #tags = :tags, #material = :material, #occasion = :occasion, #recipient = :recipient, #compatibility = :compatibility, #updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#tags": "tags",
          "#material": "material",
          "#occasion": "occasion",
          "#recipient": "recipient",
          "#compatibility": "compatibility",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":tags": next.tags ?? "",
          ":material": next.material ?? "",
          ":occasion": next.occasion ?? "",
          ":recipient": next.recipient ?? "",
          ":compatibility": next.compatibility ?? "",
          ":updatedAt": now,
        },
      })
    );
    updated += 1;
  }

  const refreshedItems = (await listProductItems(tenantId, config)) as ProductRecord[];
  const categories = [...new Set(refreshedItems.flatMap((item) => productCategoryList(item)).map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const materials = [...new Set(refreshedItems.flatMap((item) => splitProductRelationship(item.material)))].sort((a, b) => a.localeCompare(b));
  const useCases = [...new Set(refreshedItems.flatMap((item) => splitProductRelationship(item.compatibility)))].sort((a, b) => a.localeCompare(b));
  const recipients = [...new Set(refreshedItems.flatMap((item) => splitProductRelationship(item.recipient)))].sort((a, b) => a.localeCompare(b));
  const productTypeHints = buildProductTypeHints({
    items: refreshedItems,
    categories,
    materials,
    occasions: [...new Set(refreshedItems.flatMap((item) => splitProductRelationship(item.occasion)))],
    useCases,
  });
  const base = deterministicOfferingIntelligence({
    items: refreshedItems,
    categories,
    materials,
    useCases,
    recipients,
    productTypeHints,
  });
  const generated = await generateOfferingIntelligenceWithModel({
    items: refreshedItems,
    base,
    config,
    model: options?.catalogIntelligenceModel,
  });
  const intelligence = {
    ...mergeOfferingIntelligence(base, generated),
    generatedAt: generated?.generatedAt ?? new Date().toISOString(),
    model: generated?.model ?? "deterministic",
  };
  intelligence.quality = qualityScoreOfferingIntelligence(refreshedItems, intelligence);
  await writeStoredOfferingIntelligence(tenantId, config, intelligence);
  clearCatalogSearchHintsCache(tenantId);

  return {
    updated,
    total: items.length,
    intelligenceModel: intelligence.model,
    intelligenceConfidence: intelligence.confidence,
  };
}

function addRelationshipTerms(target: Set<string>, value?: string) {
  for (const term of splitProductRelationship(value)) {
    if (term) target.add(term);
  }
}

function topSkusByCategory(items: ProductRecord[]): Record<string, string[]> {
  const byCategory = new Map<string, ProductRecord[]>();
  for (const item of items) {
    for (const category of productCategoryList(item)) {
      const trimmed = category.trim();
      if (!trimmed) continue;
      const bucket = byCategory.get(trimmed) ?? [];
      bucket.push(item);
      byCategory.set(trimmed, bucket);
    }
  }
  return Object.fromEntries(
    [...byCategory.entries()].map(([category, products]) => [
      category,
      products
        .filter((p) => p.inStock !== false)
        .sort((a, b) => b.price - a.price)
        .slice(0, 8)
        .map((p) => p.sku),
    ])
  );
}

function priceCoverageForProducts(items: ProductRecord[]): CatalogPriceCoverage | undefined {
  const priced = items.filter((item) => Number.isFinite(item.price) && item.price > 0);
  if (!priced.length) return undefined;
  const inStock = priced.filter((item) => item.inStock !== false);
  const coverageItems = inStock.length ? inStock : priced;
  const prices = coverageItems.map((item) => item.price);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    count: priced.length,
    inStockCount: inStock.length,
    currency: mostCommonCurrency(priced),
  };
}

function priceBandsForCatalog(items: ProductRecord[]): CatalogPriceBand[] {
  return buildCatalogPriceBands(items);
}

function priceBandsByTerm(items: ProductRecord[], terms: string[], matcher: (item: ProductRecord, term: string) => boolean) {
  return Object.fromEntries(
    terms
      .map((term) => [term, buildCatalogPriceBands(items.filter((item) => matcher(item, term)))] as const)
      .filter(([, bands]) => bands.length)
  );
}

function priceCoverageByTerm(items: ProductRecord[], terms: string[], matcher: (item: ProductRecord, term: string) => boolean) {
  return Object.fromEntries(
    terms
      .map((term) => [term, priceCoverageForProducts(items.filter((item) => matcher(item, term)))] as const)
      .filter((entry): entry is readonly [string, CatalogPriceCoverage] => Boolean(entry[1]))
  );
}

function topSkus(items: ProductRecord[], limit = 6): string[] {
  return items
    .filter((item) => item.inStock !== false)
    .sort((a, b) => b.price - a.price)
    .slice(0, limit)
    .map((item) => item.sku);
}

function buildProductTypeHints(input: {
  items: ProductRecord[];
  categories: string[];
  materials: string[];
  occasions: string[];
  useCases: string[];
}): CatalogProductTypeHint[] {
  const { items, categories, materials, occasions, useCases } = input;
  const candidates: CatalogProductTypeHint[] = [];
  const add = (source: CatalogProductTypeHint["source"], term: string, matches: ProductRecord[]) => {
    if (!term || !matches.length) return;
    candidates.push({
      term,
      source,
      productCount: matches.length,
      inStockCount: matches.filter((item) => item.inStock !== false).length,
      priceCoverage: priceCoverageForProducts(matches),
      topSkus: topSkus(matches),
    });
  };

  for (const category of categories) {
    add(
      "category",
      category,
      items.filter((item) => productCategoryList(item).some((value) => value.toLowerCase() === category.toLowerCase()))
    );
  }
  for (const material of materials) {
    add(
      "material",
      material,
      items.filter((item) => splitProductRelationship(item.material).some((value) => value.toLowerCase() === material.toLowerCase()))
    );
  }
  for (const occasion of occasions) {
    add(
      "occasion",
      occasion,
      items.filter((item) => splitProductRelationship(item.occasion).some((value) => value.toLowerCase() === occasion.toLowerCase()))
    );
  }
  for (const useCase of useCases) {
    add(
      "use_case",
      useCase,
      items.filter((item) => splitProductRelationship(item.compatibility).some((value) => value.toLowerCase() === useCase.toLowerCase()))
    );
  }

  return candidates
    .filter((item) => item.inStockCount > 0)
    .sort((a, b) => b.inStockCount - a.inStockCount || b.productCount - a.productCount || a.term.localeCompare(b.term))
    .slice(0, 50);
}

function mostCommonTerms(values: string[], limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = value.trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

function cleanOfferingTerm(value?: string): string | undefined {
  const label = value?.trim();
  if (!label) return undefined;
  const normalized = label.toLowerCase();
  if (["item", "items", "product", "products", "option", "options"].includes(normalized)) return undefined;
  return label.length > 80 ? label.slice(0, 80).trim() : label;
}

function cleanAudienceTerm(value?: string): string | undefined {
  const label = value
    ?.replace(/["'`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!label) return undefined;
  const normalized = label.toLowerCase();
  if (
    [
      "gift",
      "gifts",
      "item",
      "items",
      "product",
      "products",
      "option",
      "options",
      "collection",
      "collections",
    ].includes(normalized)
  ) {
    return undefined;
  }
  return label.length > 40 ? label.slice(0, 40).trim() : label.replace(/\b\w/g, (char) => char.toUpperCase());
}

function audienceTermsFromCatalogLabels(labels: string[]): string[] {
  const terms: string[] = [];
  for (const label of labels) {
    const normalized = label
      .replace(/[()/_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) continue;
    const parts = normalized.split(/\bfor\b/i);
    if (parts.length < 2) continue;
    for (const part of parts.slice(1)) {
      const candidate = cleanAudienceTerm(part.replace(/\b(gifts?|items?|products?|options?|collections?)\b/gi, ""));
      if (candidate) terms.push(candidate);
    }
  }
  return terms;
}

function catalogText(items: ProductRecord[]): string {
  return items
    .slice(0, 500)
    .map((item) =>
      [
        item.name,
        item.description,
        item.category,
        ...(item.categories ?? []),
        item.tags,
        item.compatibility,
        item.variants,
        item.duration,
        item.location,
        item.bookingType,
        item.packageIncludes,
        item.availability,
        item.staffRole,
        item.serviceArea,
      ].filter(Boolean).join(" ")
    )
    .join(" ")
    .toLowerCase();
}

function detectOfferingMode(items: ProductRecord[]): CatalogOfferingMode {
  if (!items.length) return "unknown";
  const text = catalogText(items);
  const serviceFieldCount = items.filter((item) =>
    item.duration || item.bookingType || item.packageIncludes || item.availability || item.staffRole || item.serviceArea
  ).length;
  const serviceSignals = [
    "service",
    "services",
    "consultation",
    "appointment",
    "booking",
    "package",
    "session",
    "class",
    "course",
    "repair",
    "installation",
    "rental",
    "training",
  ];
  const productSignals = ["sku", "stock", "in stock", "material", "size", "color", "shipping", "delivery"];
  const serviceScore = serviceSignals.filter((term) => text.includes(term)).length + serviceFieldCount / Math.max(items.length, 1);
  const productScore =
    productSignals.filter((term) => text.includes(term)).length +
    items.filter((item) => item.imageUrl || item.imageUrls?.length || item.inStock !== false).length / Math.max(items.length, 1);
  if (serviceScore >= 2 && productScore >= 2) return "mixed";
  if (serviceScore >= 2 && serviceScore > productScore) return "services";
  if (productScore > 0) return "products";
  return "unknown";
}

function defaultDecisionFactors(items: ProductRecord[]): string[] {
  const factors = new Set<string>();
  if (items.some((item) => Number.isFinite(item.price) && item.price > 0)) factors.add("budget");
  if (items.some((item) => splitProductRelationship(item.material).length)) factors.add("material");
  if (items.some((item) => splitProductRelationship(item.tags).length)) factors.add("style");
  if (items.some((item) => splitProductRelationship(item.variants).length)) factors.add("variant");
  if (items.some((item) => splitProductRelationship(item.compatibility).length)) factors.add("use case");
  if (detectOfferingMode(items) === "services") {
    factors.add("service type");
    factors.add("schedule");
  }
  return [...factors].slice(0, 8);
}

function buildOfferingTypes(input: {
  categories: string[];
  materials: string[];
  useCases: string[];
  productTypeHints: CatalogProductTypeHint[];
}): string[] {
  return mostCommonTerms([
    ...input.productTypeHints.map((hint) => hint.term),
    ...input.categories,
    ...input.useCases,
    ...input.materials.map((material) => `${material} offerings`),
  ], 30)
    .map(cleanOfferingTerm)
    .filter((term): term is string => Boolean(term));
}

function buildStarterIntents(input: {
  offeringMode: CatalogOfferingMode;
  offeringTypes: string[];
  useCases: string[];
  audiences: string[];
}): string[] {
  const starters: string[] = [];
  for (const term of input.offeringTypes.slice(0, 4)) starters.push(`Show me ${term}`);
  for (const useCase of input.useCases.slice(0, 3)) starters.push(`I need help with ${useCase}`);
  for (const audience of input.audiences.slice(0, 2)) starters.push(`Options for ${audience}`);
  if (input.offeringMode === "services") {
    starters.push("Compare service options");
    starters.push("Book a consultation");
  } else if (input.offeringMode === "products") {
    starters.push("Show best sellers");
  } else {
    starters.push("Show popular options");
  }
  return mostCommonTerms(starters, 8);
}

function qualityScoreOfferingIntelligence(
  items: ProductRecord[],
  intelligence: Pick<CatalogOfferingIntelligence, "starterIntents" | "offeringTypes" | "decisionFactors" | "audiences">
): { score: number; warnings: string[] } {
  const text = catalogText(items);
  const warnings: string[] = [];
  const unsupportedOfferings = intelligence.offeringTypes.filter((term) => !text.includes(term.toLowerCase())).slice(0, 5);
  if (unsupportedOfferings.length) warnings.push(`Unsupported offering terms: ${unsupportedOfferings.join(", ")}`);
  const unsupportedStarters = intelligence.starterIntents
    .filter((starter) => {
      const normalized = starter.toLowerCase();
      return !intelligence.offeringTypes.some((term) => normalized.includes(term.toLowerCase())) &&
        !intelligence.decisionFactors.some((term) => normalized.includes(term.toLowerCase())) &&
        !intelligence.audiences.some((term) => normalized.includes(term.toLowerCase()));
    })
    .slice(0, 5);
  if (unsupportedStarters.length) warnings.push(`Starter intents need review: ${unsupportedStarters.join(", ")}`);
  const score = Math.max(0, 1 - warnings.length * 0.25);
  return { score, warnings };
}

function buildUseCaseProfiles(input: {
  items: ProductRecord[];
  useCases: string[];
  audiences: string[];
  decisionFactors: string[];
}): Record<string, CatalogUseCaseProfile> {
  const entries: Array<[string, CatalogUseCaseProfile]> = [];
  for (const useCase of input.useCases.slice(0, 20)) {
    const matches = input.items.filter((item) =>
      splitProductRelationship(item.compatibility).some((value) => value.toLowerCase() === useCase.toLowerCase()) ||
      productCategoryList(item).some((value) => value.toLowerCase() === useCase.toLowerCase())
    );
    if (!matches.length) continue;
    entries.push([
      useCase,
      {
        terms: mostCommonTerms(matches.flatMap((item) => [...productCategoryList(item), ...splitProductRelationship(item.tags)]), 8),
        audiences: mostCommonTerms(matches.flatMap((item) => splitProductRelationship(item.recipient)), 6),
        decisionFactors: input.decisionFactors,
        offeringTypes: mostCommonTerms(matches.flatMap((item) => productCategoryList(item)), 6),
        priceCoverage: priceCoverageForProducts(matches),
      },
    ]);
  }
  return Object.fromEntries(entries);
}

function mergeTermLists(primary: string[] | undefined, fallback: string[], limit: number): string[] {
  const values = new Map<string, string>();
  for (const value of [...(primary ?? []), ...fallback]) {
    const label = value.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (!values.has(key)) values.set(key, label);
  }
  return [...values.values()].slice(0, limit);
}

function deterministicOfferingIntelligence(input: {
  items: ProductRecord[];
  categories: string[];
  materials: string[];
  useCases: string[];
  recipients: string[];
  productTypeHints: CatalogProductTypeHint[];
}): CatalogOfferingIntelligence {
  const offeringMode = detectOfferingMode(input.items);
  const offeringTypes = buildOfferingTypes(input);
  const derivedAudiences = audienceTermsFromCatalogLabels([
    ...input.categories,
    ...input.useCases,
    ...input.productTypeHints.map((hint) => hint.term),
  ]);
  const audiences = mostCommonTerms([...input.recipients, ...derivedAudiences], 20);
  const decisionFactors = defaultDecisionFactors(input.items);
  const useCaseProfiles = buildUseCaseProfiles({
    items: input.items,
    useCases: input.useCases,
    audiences,
    decisionFactors,
  });
  return {
    offeringMode,
    offeringTypes,
    useCaseProfiles,
    audiences,
    decisionFactors,
    starterIntents: buildStarterIntents({ offeringMode, offeringTypes, useCases: input.useCases, audiences }),
    confidence: input.items.length ? 0.65 : 0,
    sourceEvidence: input.items.slice(0, 5).map((item) => item.name).filter(Boolean),
    quality: qualityScoreOfferingIntelligence(input.items, { offeringTypes, audiences, decisionFactors, starterIntents: buildStarterIntents({ offeringMode, offeringTypes, useCases: input.useCases, audiences }) }),
  };
}

function buildGiftProfiles(items: ProductRecord[], occasions: string[]): Record<string, CatalogGiftProfile> {
  const entries: Array<[string, CatalogGiftProfile]> = [];
  for (const occasion of occasions) {
    const matches = items.filter((item) =>
      splitProductRelationship(item.occasion).some((value) => value.toLowerCase() === occasion.toLowerCase())
    );
    if (!matches.length) continue;
    entries.push([
      occasion,
      {
        recipients: mostCommonTerms(matches.flatMap((item) => splitProductRelationship(item.recipient))),
        styles: mostCommonTerms(matches.flatMap((item) => splitProductRelationship(item.tags))),
        useCases: mostCommonTerms(matches.flatMap((item) => splitProductRelationship(item.compatibility))),
        categories: mostCommonTerms(matches.flatMap((item) => productCategoryList(item))),
        priceCoverage: priceCoverageForProducts(matches),
      },
    ]);
  }
  return Object.fromEntries(entries);
}

function buildAttributeSummaries(items: ProductRecord[], categories: string[]): Record<string, CatalogAttributeSummary> {
  const entries: Array<[string, CatalogAttributeSummary]> = [];
  for (const category of categories) {
    const matches = items.filter((item) =>
      productCategoryList(item).some((value) => value.toLowerCase() === category.toLowerCase())
    );
    if (!matches.length) continue;
    entries.push([
      category,
      {
        materials: mostCommonTerms(matches.flatMap((item) => splitProductRelationship(item.material))),
        styles: mostCommonTerms(matches.flatMap((item) => splitProductRelationship(item.tags))),
        useCases: mostCommonTerms(matches.flatMap((item) => splitProductRelationship(item.compatibility))),
        variants: mostCommonTerms(matches.flatMap((item) => splitProductRelationship(item.variants)), 8),
        priceCoverage: priceCoverageForProducts(matches),
        topSkus: topSkus(matches),
      },
    ]);
  }
  return Object.fromEntries(entries);
}

function mergeOfferingIntelligence(
  base: CatalogOfferingIntelligence,
  generated?: Partial<CatalogOfferingIntelligence>
): CatalogOfferingIntelligence {
  if (!generated) return base;
  return {
    ...base,
    ...generated,
    offeringMode: generated.offeringMode ?? base.offeringMode,
    offeringTypes: generated.offeringTypes?.length ? generated.offeringTypes : base.offeringTypes,
    useCaseProfiles: Object.keys(generated.useCaseProfiles ?? {}).length ? generated.useCaseProfiles! : base.useCaseProfiles,
    audiences: mergeTermLists(generated.audiences, base.audiences, 30),
    decisionFactors: generated.decisionFactors?.length ? generated.decisionFactors : base.decisionFactors,
    starterIntents: generated.starterIntents?.length ? generated.starterIntents : base.starterIntents,
  };
}

function parseOfferingIntelligenceJson(content: string): Partial<CatalogOfferingIntelligence> | undefined {
  const jsonText = content.trim().match(/\{[\s\S]*\}/)?.[0] ?? content.trim();
  try {
    const parsed = JSON.parse(jsonText) as Partial<CatalogOfferingIntelligence>;
    if (!parsed || typeof parsed !== "object") return undefined;
    const modes: CatalogOfferingMode[] = ["products", "services", "mixed", "unknown"];
    return {
      offeringMode: modes.includes(parsed.offeringMode as CatalogOfferingMode) ? parsed.offeringMode : undefined,
      offeringTypes: Array.isArray(parsed.offeringTypes) ? parsed.offeringTypes.map(String).slice(0, 40) : undefined,
      useCaseProfiles: parsed.useCaseProfiles && typeof parsed.useCaseProfiles === "object" ? parsed.useCaseProfiles : undefined,
      audiences: Array.isArray(parsed.audiences) ? parsed.audiences.map(String).slice(0, 30) : undefined,
      decisionFactors: Array.isArray(parsed.decisionFactors) ? parsed.decisionFactors.map(String).slice(0, 20) : undefined,
      starterIntents: Array.isArray(parsed.starterIntents) ? parsed.starterIntents.map(String).slice(0, 10) : undefined,
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : undefined,
      sourceEvidence: Array.isArray(parsed.sourceEvidence) ? parsed.sourceEvidence.map(String).slice(0, 10) : undefined,
    };
  } catch {
    return undefined;
  }
}

async function readStoredOfferingIntelligence(
  tenantId: string,
  config: CoreConfig
): Promise<Partial<CatalogOfferingIntelligence> | undefined> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.catalogIntelligence() },
    })
  );
  return res.Item?.intelligence as Partial<CatalogOfferingIntelligence> | undefined;
}

async function writeStoredOfferingIntelligence(
  tenantId: string,
  config: CoreConfig,
  intelligence: CatalogOfferingIntelligence
) {
  const db = getDocClient(config);
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.catalogIntelligence(),
        intelligence,
        updatedAt: new Date().toISOString(),
      },
    })
  );
}

async function generateOfferingIntelligenceWithModel(input: {
  items: ProductRecord[];
  base: CatalogOfferingIntelligence;
  config: CoreConfig;
  model?: string;
}): Promise<Partial<CatalogOfferingIntelligence> | undefined> {
  const llm = createLLMProvider(input.config);
  const model = input.model ?? input.config.catalogIntelligenceModel ?? input.config.llmModel;
  if (!llm || !model) return undefined;
  const catalogSample = input.items.slice(0, 80).map((item) => ({
    name: item.name,
    description: item.description?.slice(0, 500),
    categories: productCategoryList(item),
    tags: splitProductRelationship(item.tags),
    material: splitProductRelationship(item.material),
    useCases: splitProductRelationship(item.compatibility),
    audience: splitProductRelationship(item.recipient),
    variants: splitProductRelationship(item.variants),
    duration: item.duration,
    location: item.location,
    bookingType: item.bookingType,
    packageIncludes: item.packageIncludes,
    availability: item.availability,
    staffRole: item.staffRole,
    serviceArea: item.serviceArea,
    price: item.price,
    currency: item.currency,
  }));
  try {
    const intelligenceRequest: Omit<ChatRequest, "responseFormat"> = {
      model,
      temperature: 0.1,
      maxOutputTokens: 900,
      messages: [
        {
          role: "system",
          content:
            "Generate tenant commerce intelligence from catalog/service data. Return ONLY compact JSON. " +
            "Do not assume the tenant sells gifts or physical products. It may sell services, products, or both. " +
            "Schema: {offeringMode,offeringTypes,useCaseProfiles,audiences,decisionFactors,starterIntents,confidence,sourceEvidence}. " +
            "offeringMode must be products, services, mixed, or unknown. " +
            "audiences must be customer/recipient/participant groups explicitly supported by catalog labels or item recipient fields; " +
            "derive groups from labels like 'for X' when present, but do not put product types, materials, occasions, or generic use cases in audiences. " +
            "starterIntents must be clickable customer messages.",
        },
        {
          role: "user",
          content: JSON.stringify({
            deterministicBase: input.base,
            catalogSample,
          }),
        },
      ],
    };
    let response;
    try {
      response = await llm.chat({
        ...intelligenceRequest,
        responseFormat: CATALOG_INTELLIGENCE_RESPONSE_FORMAT,
      });
    } catch {
      response = await llm.chat(intelligenceRequest);
    }
    return {
      ...parseOfferingIntelligenceJson(response.content),
      model,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[catalog-intelligence] high-model generation failed", err instanceof Error ? err.message : err);
    return undefined;
  }
}

function buildCatalogAliases(items: ProductRecord[], materials: string[], categories: string[]): Record<string, string[]> {
  const aliases = new Map<string, Set<string>>();
  const aliasStopWords = new Set(["item", "items", "product", "products", "gift", "gifts", "decor", "decoration"]);
  const add = (alias: string, target: string) => {
    const key = alias.trim().toLowerCase();
    const value = target.trim();
    if (!key || !value) return;
    const bucket = aliases.get(key) ?? new Set<string>();
    bucket.add(value);
    aliases.set(key, bucket);
  };
  const addGeneratedForms = (target: string) => {
    const normalized = target
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return;
    add(normalized, target);
    const lower = normalized.toLowerCase();
    if (lower.endsWith(" items")) add(normalized.slice(0, -6), target);
    if (lower.endsWith(" item")) add(normalized.slice(0, -5), target);
    if (lower.endsWith("s") && normalized.length > 4) add(normalized.slice(0, -1), target);
    for (const part of normalized.split(/\s+/)) {
      if (part.length >= 4 && !aliasStopWords.has(part.toLowerCase())) add(part, target);
    }
  };

  const materialSet = new Set(materials.map((item) => item.toLowerCase()));
  for (const material of materials) addGeneratedForms(material);
  for (const category of categories) addGeneratedForms(category);

  for (const item of items.slice(0, 500)) {
    for (const term of [
      ...splitProductRelationship(item.material),
      ...splitProductRelationship(item.occasion),
      ...splitProductRelationship(item.compatibility),
      ...splitProductRelationship(item.tags),
      ...productCategoryList(item),
    ]) {
      addGeneratedForms(term);
    }
  }

  if (materialSet.has("brass")) {
    add("piththala", "Brass");
    add("pittala", "Brass");
    add("පිත්තල", "Brass");
  }
  if (materialSet.has("silver")) {
    add("ridi", "Silver");
    add("ridiya", "Silver");
    add("රිදී", "Silver");
  }

  const text = items.map((item) => [item.name, item.description, item.category, ...productCategoryList(item)].join(" ")).join(" ").toLowerCase();
  if (/oil\s+lamp|පහන|පහන්|lamp/.test(text)) {
    add("pahan", "Oil Lamp");
    add("pahana", "Oil Lamp");
    add("පහන්", "Oil Lamp");
    add("පහන", "Oil Lamp");
  }
  if (/punkalasa|pun\s+kalasa|kalasa|කලස/.test(text)) {
    add("punkalasa", "Punkalasa");
    add("pun kalasa", "Punkalasa");
    add("kalasa", "Punkalasa");
    add("කලස", "Punkalasa");
  }
  if (/elephant|aliya|අලියා/.test(text)) {
    add("aliya", "Elephant");
    add("aliyaa", "Elephant");
    add("අලියා", "Elephant");
  }
  for (const category of categories) {
    const normalized = category.toLowerCase();
    if (normalized.includes("lamp")) add("lamp", category);
    if (normalized.includes("decor")) add("decor", category);
  }
  return Object.fromEntries([...aliases.entries()].map(([alias, values]) => [alias, [...values]]));
}

export async function listCatalogSearchHints(
  tenantId: string,
  config: CoreConfig
): Promise<CatalogSearchHints> {
  const cached = catalogHintsCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.hints;
  const items = (await listProductItems(tenantId, config)) as ProductRecord[];
  const categories = new Set<string>();
  const tags = new Set<string>();
  const materials = new Set<string>();
  const recipients = new Set<string>();
  const occasions = new Set<string>();
  const useCases = new Set<string>();
  const styles = new Set<string>();
  const occasionRecipients = new Map<string, Set<string>>();

  for (const item of items) {
    for (const category of productCategoryList(item)) {
      const trimmed = category.trim();
      if (trimmed) categories.add(trimmed);
    }
    for (const tag of (item.tags ?? "").split(/[,|;]/)) {
      const trimmed = tag.trim();
      if (trimmed) tags.add(trimmed);
    }
    addRelationshipTerms(materials, item.material);
    const itemRecipients = splitProductRelationship(item.recipient);
    const itemOccasions = splitProductRelationship(item.occasion);
    addRelationshipTerms(useCases, item.compatibility);
    addRelationshipTerms(styles, item.tags);
    for (const recipient of itemRecipients) {
      recipients.add(recipient);
    }
    for (const occasion of itemOccasions) {
      occasions.add(occasion);
      const byOccasion = occasionRecipients.get(occasion) ?? new Set<string>();
      for (const recipient of itemRecipients) {
        byOccasion.add(recipient);
      }
      occasionRecipients.set(occasion, byOccasion);
    }
  }

  const categoryList = [...categories].sort((a, b) => a.localeCompare(b));
  const materialList = [...materials].sort((a, b) => a.localeCompare(b));
  const recipientList = [...recipients].sort((a, b) => a.localeCompare(b));
  const occasionList = [...occasions].sort((a, b) => a.localeCompare(b));
  const useCaseList = [...useCases].sort((a, b) => a.localeCompare(b));
  const productTypeHints = buildProductTypeHints({
    items,
    categories: categoryList,
    materials: materialList,
    occasions: occasionList,
    useCases: useCaseList,
  });
  const deterministicIntelligence = deterministicOfferingIntelligence({
    items,
    categories: categoryList,
    materials: materialList,
    useCases: useCaseList,
    recipients: recipientList,
    productTypeHints,
  });
  const storedIntelligence = await readStoredOfferingIntelligence(tenantId, config).catch(() => undefined);
  const offeringIntelligence = mergeOfferingIntelligence(deterministicIntelligence, storedIntelligence);
  offeringIntelligence.quality = qualityScoreOfferingIntelligence(items, offeringIntelligence);

  const hints: CatalogSearchHints = {
    categories: categoryList,
    tags: [...tags].sort((a, b) => a.localeCompare(b)),
    materials: materialList,
    recipients: recipientList,
    occasions: occasionList,
    useCases: useCaseList,
    styles: [...styles].sort((a, b) => a.localeCompare(b)),
    priceBands: priceBandsForCatalog(items),
    priceBandsByCategory: priceBandsByTerm(items, categoryList, (item, term) => productCategoryList(item).some((category) => category.toLowerCase() === term.toLowerCase())),
    priceBandsByMaterial: priceBandsByTerm(items, materialList, (item, term) => splitProductRelationship(item.material).some((material) => material.toLowerCase() === term.toLowerCase())),
    aliases: buildCatalogAliases(items, materialList, categoryList),
    occasionRecipients: Object.fromEntries(
      [...occasionRecipients.entries()].map(([occasion, values]) => [
        occasion,
        [...values].sort((a, b) => a.localeCompare(b)),
      ])
    ),
    relatedByCategory: topSkusByCategory(items),
    priceCoverageByCategory: priceCoverageByTerm(items, categoryList, (item, term) => productCategoryList(item).some((category) => category.toLowerCase() === term.toLowerCase())),
    priceCoverageByMaterial: priceCoverageByTerm(items, materialList, (item, term) => splitProductRelationship(item.material).some((material) => material.toLowerCase() === term.toLowerCase())),
    productTypeHints,
    giftProfiles: buildGiftProfiles(items, occasionList),
    attributeSummaries: buildAttributeSummaries(items, categoryList),
    offeringMode: offeringIntelligence.offeringMode,
    offeringTypes: offeringIntelligence.offeringTypes,
    useCaseProfiles: offeringIntelligence.useCaseProfiles,
    audiences: offeringIntelligence.audiences,
    decisionFactors: offeringIntelligence.decisionFactors,
    starterIntents: offeringIntelligence.starterIntents,
    intelligenceQuality: offeringIntelligence.quality,
    intelligenceGeneratedAt: offeringIntelligence.generatedAt,
    intelligenceModel: offeringIntelligence.model,
  };
  catalogHintsCache.set(tenantId, { expiresAt: Date.now() + CATALOG_HINTS_CACHE_TTL_MS, hints });
  return hints;
}

export {
  productCategoryList,
  productMatchReasons,
  productRelationshipTerms,
  searchTermsFromQuery,
  scoreProductRelevance,
  splitProductRelationship,
  rankProductsByRelevance,
};
