import type { QualificationState } from "@commercechat/shared";

const PAGE_WORD_STOP = new Set(["products", "product", "collections", "collection", "shop", "store"]);

function pageTerms(pageUrl?: string): string[] {
  if (!pageUrl) return [];
  try {
    const url = new URL(pageUrl);
    return url.pathname
      .split(/[\/\-_]+/)
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length >= 3 && !PAGE_WORD_STOP.has(part))
      .slice(-4);
  } catch {
    return [];
  }
}

export function buildProductSearchQuery(input: {
  message: string;
  qualification?: QualificationState;
  pageUrl?: string;
}): string {
  const parts = [input.message.trim()];
  const qualification = input.qualification;

  if (qualification?.category) parts.push(qualification.category);
  if (qualification?.recipient) parts.push(`for ${qualification.recipient}`);
  if (qualification?.constraints?.length) parts.push(...qualification.constraints);
  if (qualification?.budget?.max != null) parts.push(`under ${qualification.budget.max}`);
  if (qualification?.budget?.min != null) parts.push(`from ${qualification.budget.min}`);
  parts.push(...pageTerms(input.pageUrl));

  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join(" ");
}
