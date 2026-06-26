import type { ProductRecord } from "./products";

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "and",
  "or",
  "do",
  "you",
  "have",
  "has",
  "had",
  "is",
  "are",
  "was",
  "were",
  "it",
  "its",
  "i",
  "me",
  "my",
  "we",
  "our",
  "any",
  "some",
  "with",
  "that",
  "this",
  "what",
  "how",
  "can",
  "could",
  "would",
  "like",
  "need",
  "want",
  "show",
  "see",
  "get",
  "saw",
  "them",
  "they",
  "there",
  "been",
  "being",
  "items",
  "item",
  "looking",
  "lookin",
  "find",
  "shopping",
  "gift",
  "gifts",
  "under",
  "below",
  "less",
  "than",
  "within",
  "budget",
  "lkr",
  "rs",
  "rupees",
  "usd",
  "max",
  "upto",
  "up",
  "best",
  "seller",
  "sellers",
  "recommend",
  "suggest",
  "suitable",
  "good",
  "ideal",
  "perfect",
]);

export function productCategoryList(record: ProductRecord): string[] {
  if (record.categories?.length) return record.categories;
  return record.category ? [record.category] : [];
}

export function productCategoriesText(record: ProductRecord): string {
  const cats = productCategoryList(record);
  return cats.length ? cats.join(", ") : "";
}

export function splitProductRelationship(value?: string): string[] {
  return (value ?? "")
    .split(/[,|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function productRelationshipTerms(record: ProductRecord): string[] {
  return [
    ...splitProductRelationship(record.material),
    ...splitProductRelationship(record.occasion),
    ...splitProductRelationship(record.recipient),
    ...splitProductRelationship(record.compatibility),
    ...splitProductRelationship(record.bundles),
  ];
}

function relationshipBlob(record: ProductRecord): string {
  return productRelationshipTerms(record).join(" ").toLowerCase();
}

export function categoryFilterMatches(record: ProductRecord, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;

  const inCategories = productCategoryList(record).some((c) => {
    const hay = c.toLowerCase();
    return hay.includes(needle) || needle.includes(hay);
  });
  if (inCategories) return true;

  const name = record.name.toLowerCase();
  const desc = (record.description ?? "").toLowerCase();
  const tags = (record.tags ?? "").toLowerCase();
  const relationships = relationshipBlob(record);
  return name.includes(needle) || desc.includes(needle) || tags.includes(needle) || relationships.includes(needle);
}

export function searchTermsFromQuery(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[\s,]+/)
        .filter((t) => t.length >= 2 && !STOP_WORDS.has(t) && !/^\d{2,}$/.test(t))
    ),
  ];
}

function normalizedSkuMatches(record: ProductRecord, query: string): boolean {
  const sku = record.sku.toLowerCase();
  const compactSku = sku.replace(/[^a-z0-9]/g, "");
  const compactQuery = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!sku || !compactQuery) return false;
  return compactQuery.includes(compactSku) || query.toLowerCase().includes(sku);
}

function budgetFitScore(record: ProductRecord, options?: { maxPrice?: number; minPrice?: number }) {
  let score = 0;
  if (options?.maxPrice != null) {
    if (record.price <= options.maxPrice) {
      score += 5;
      const ratio = options.maxPrice > 0 ? record.price / options.maxPrice : 1;
      if (ratio >= 0.65 && ratio <= 1.05) score += 2;
    } else {
      score -= 8;
    }
  }
  if (options?.minPrice != null) {
    if (record.price >= options.minPrice) score += 3;
    else score -= 4;
  }
  return score;
}

/** Higher = better match on name, categories, tags, description. */
export function scoreProductRelevance(record: ProductRecord, terms: string[]): number {
  if (!terms.length) return 0;

  const name = record.name.toLowerCase();
  const desc = (record.description ?? "").toLowerCase();
  const tags = (record.tags ?? "").toLowerCase();
  const cats = productCategoryList(record).map((c) => c.toLowerCase());
  const catBlob = cats.join(" ");
  const sku = record.sku.toLowerCase();
  const relationships = relationshipBlob(record);

  let score = 0;
  for (const term of terms) {
    if (name.includes(term)) score += 6;
    if (sku.includes(term)) score += 5;
    if (cats.some((c) => c.includes(term) || term.includes(c))) score += 5;
    if (catBlob.includes(term)) score += 3;
    if (tags.includes(term)) score += 3;
    if (relationships.includes(term)) score += 4;
    if (desc.includes(term)) score += 2;
  }
  return score;
}

export function productMatchReasons(
  record: ProductRecord,
  query: string,
  options?: { category?: string; maxPrice?: number; minPrice?: number; vectorScore?: number }
): string[] {
  const reasons: string[] = [];
  const terms = searchTermsFromQuery(query);
  const name = record.name.toLowerCase();
  const desc = (record.description ?? "").toLowerCase();
  const tags = (record.tags ?? "").toLowerCase();
  const cats = productCategoryList(record).map((c) => c.toLowerCase());
  const relationships = relationshipBlob(record);

  if (record.inStock !== false) reasons.push("in stock");
  if (options?.category && categoryFilterMatches(record, options.category)) {
    reasons.push(`matches ${options.category}`);
  } else if (terms.some((term) => cats.some((c) => c.includes(term) || term.includes(c)))) {
    reasons.push("category match");
  }
  if (terms.some((term) => name.includes(term))) reasons.push("name match");
  if (terms.some((term) => desc.includes(term))) reasons.push("description match");
  if (terms.some((term) => tags.includes(term))) reasons.push("tag match");
  if (terms.some((term) => relationships.includes(term))) reasons.push("relationship match");
  if (options?.maxPrice != null && record.price <= options.maxPrice) reasons.push("within budget");
  if (options?.minPrice != null && record.price >= options.minPrice) reasons.push("above minimum budget");
  if ((options?.vectorScore ?? 0) > 0.2) reasons.push("semantic match");

  return [...new Set(reasons)].slice(0, 4);
}

export function rankProductsByRelevance(
  products: ProductRecord[],
  query: string,
  options?: {
    category?: string;
    requiredTerms?: string[];
    maxPrice?: number;
    minPrice?: number;
    limit?: number;
    vectorScores?: Map<string, number>;
    excludeSkus?: string[];
  }
): ProductRecord[] {
  let terms = searchTermsFromQuery(query);
  if (options?.category) {
    terms = [...new Set([...terms, ...searchTermsFromQuery(options.category)])];
  }
  const limit = options?.limit ?? 5;
  const excludedSkus = new Set((options?.excludeSkus ?? []).map((sku) => sku.trim().toUpperCase()));

  const scored = products
    .map((record) => {
      let score = scoreProductRelevance(record, terms);
      if (normalizedSkuMatches(record, query)) score += 20;
      if (options?.category) {
        const catNeedle = options.category.trim().toLowerCase();
        if (categoryFilterMatches(record, catNeedle)) score += 8;
      }
      const vectorBoost = options?.vectorScores?.get(record.sku) ?? 0;
      score += Math.round(vectorBoost * 4);
      score += budgetFitScore(record, options);
      if (record.inStock !== false) score += 3;
      if (record.imageUrl || record.imageUrls?.length) score += 1;
      if (record.productUrl) score += 1;
      return { record, score };
    })
    .filter(({ record, score }) => {
      if (score <= 0) return false;
      if (excludedSkus.has(record.sku.toUpperCase())) return false;
      if (record.inStock === false) return false;
      if (options?.requiredTerms?.some((term) => !categoryFilterMatches(record, term))) return false;
      if (options?.maxPrice != null && record.price > options.maxPrice) return false;
      if (options?.minPrice != null && record.price < options.minPrice) return false;
      return true;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.record.inStock !== b.record.inStock) {
        return a.record.inStock === false ? 1 : -1;
      }
      return b.record.price - a.record.price;
    });

  return scored.slice(0, limit).map((s) => s.record);
}
