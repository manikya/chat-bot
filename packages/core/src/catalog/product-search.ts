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
]);

export function productCategoryList(record: ProductRecord): string[] {
  if (record.categories?.length) return record.categories;
  return record.category ? [record.category] : [];
}

export function productCategoriesText(record: ProductRecord): string {
  const cats = productCategoryList(record);
  return cats.length ? cats.join(", ") : "";
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
  return name.includes(needle) || desc.includes(needle) || tags.includes(needle);
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

  let score = 0;
  for (const term of terms) {
    if (name.includes(term)) score += 6;
    if (sku.includes(term)) score += 5;
    if (cats.some((c) => c.includes(term) || term.includes(c))) score += 5;
    if (catBlob.includes(term)) score += 3;
    if (tags.includes(term)) score += 3;
    if (desc.includes(term)) score += 2;
  }
  return score;
}

export function rankProductsByRelevance(
  products: ProductRecord[],
  query: string,
  options?: {
    category?: string;
    maxPrice?: number;
    minPrice?: number;
    limit?: number;
    vectorScores?: Map<string, number>;
  }
): ProductRecord[] {
  let terms = searchTermsFromQuery(query);
  if (options?.category) {
    terms = [...new Set([...terms, ...searchTermsFromQuery(options.category)])];
  }
  const limit = options?.limit ?? 5;

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
