import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import type { CatalogProduct } from "../ingest/parsers/catalog-csv";
import { notifyWishlistRemindersForProducts } from "../chat/wishlist";
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
  material?: string;
  occasion?: string;
  recipient?: string;
  compatibility?: string;
  bundles?: string;
  variants?: string;
}

export interface CatalogPriceBand {
  label: string;
  message: string;
  min?: number;
  max?: number;
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
  config: CoreConfig
): Promise<{ updated: number; total: number }> {
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

  return { updated, total: items.length };
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

  return {
    categories: categoryList,
    tags: [...tags].sort((a, b) => a.localeCompare(b)),
    materials: materialList,
    recipients: [...recipients].sort((a, b) => a.localeCompare(b)),
    occasions: [...occasions].sort((a, b) => a.localeCompare(b)),
    useCases: [...useCases].sort((a, b) => a.localeCompare(b)),
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
  };
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
