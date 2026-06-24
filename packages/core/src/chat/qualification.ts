import type { QualificationState } from "@commercechat/shared";
import type { ChatMarket } from "./locale";
import { messageSignalsObjection } from "./funnel";
import { LK_OBJECTION_KEYWORDS } from "./locale";

const RECIPIENT_PATTERNS = [
  /\b(?:gift\s+)?for\s+(?:my\s+)?([a-z][a-z\s]{2,30}?)(?:\s*[,.!?]|$)/i,
  /\bfor\s+(?:my\s+)?(mom|dad|mother|father|wife|husband|friend|son|daughter|brother|sister)\b/i,
];

const NON_RECIPIENT_PHRASES = new Set([
  "event",
  "event giveaways",
  "event table decor",
  "awards",
  "awards or appreciation gifts",
  "appreciation gifts",
  "table decor",
  "personal use",
  "birthday",
  "anniversary",
  "wedding",
  "graduation",
  "housewarming",
  "christmas",
  "new year",
  "valentine",
]);

const PRICE_TIER_TERMS = new Set(["budget", "budget friendly", "mid range", "premium", "premium picks", "luxury"]);

interface QualificationExtractionOptions {
  catalogCategories?: string[];
  catalogTags?: string[];
  catalogMaterials?: string[];
  catalogOccasions?: string[];
  catalogUseCases?: string[];
  catalogStyles?: string[];
}

const GENERIC_CONSTRAINT_PATTERNS = [
  /\b(birthday|anniversary|wedding|graduation|housewarming|corporate|cooperate|event|giveaway|giveaways|decor|awards?|appreciation|valentine|christmas|new year)\b/gi,
  /\b(small|large|mini|premium|luxury|cheap|affordable|personalized|custom|practical|sentimental|decorative)\b/gi,
  /\bpersonal\s+use\b/gi,
];

function parseBudgetNumber(raw: string, market: ChatMarket): number | undefined {
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (market === "lk" && n < 500) return n * 1000;
  return n;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function messageContainsCatalogTerm(message: string, term: string): boolean {
  const normalized = term.trim();
  if (normalized.length < 3) return false;
  return new RegExp(`(^|\\W)${escapeRegExp(normalized)}($|\\W)`, "i").test(message);
}

export function extractBudgetFromMessage(
  message: string,
  market: ChatMarket = "default"
): { min?: number; max?: number } | undefined {
  const lower = message.toLowerCase();

  const underMatch =
    lower.match(
      /\b(?:under|below|less than|max|upto|up to|within)\s*(?:rs\.?|lkr|usd|\$|€|£)?\s*([\d,]+(?:\.\d+)?)\s*(?:k|lkr|rs)?\b/i
    ) ??
    lower.match(/\b(?:rs\.?|lkr)\s*([\d,]+(?:\.\d+)?)\s*(?:k)?\s*(?:max|or less)\b/i);
  if (underMatch?.[1]) {
    const max = parseBudgetNumber(underMatch[1], market);
    if (max != null) return { max };
  }

  const rangeMatch = lower.match(
    /\b(?:rs\.?|lkr|usd|\$)?\s*([\d,]+)\s*(?:-|to)\s*(?:rs\.?|lkr|usd|\$)?\s*([\d,]+)\b/i
  );
  if (rangeMatch?.[1] && rangeMatch[2]) {
    const min = parseBudgetNumber(rangeMatch[1], market);
    const max = parseBudgetNumber(rangeMatch[2], market);
    if (min != null && max != null) return { min, max };
  }

  const overMatch = lower.match(/\b(?:over|above|at least|from)\s*(?:rs\.?|lkr|usd|\$)?\s*([\d,]+)/i);
  if (overMatch?.[1]) {
    const min = parseBudgetNumber(overMatch[1], market);
    if (min != null) return { min };
  }

  return undefined;
}

function catalogTermFromMessage(message: string, terms?: string[]): string | undefined {
  if (!terms?.length) return undefined;
  const lower = message.toLowerCase();
  return [...terms]
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .sort((a, b) => b.length - a.length)
    .find((term) => messageContainsCatalogTerm(lower, term));
}

export function extractCategoryFromMessage(
  message: string,
  options?: QualificationExtractionOptions
): string | undefined {
  const lower = message.toLowerCase();
  const catalogCategory = catalogTermFromMessage(message, options?.catalogCategories);
  if (catalogCategory) return catalogCategory;

  if (/\b(corporate|cooperate|event|giveaways?|table decor|awards?|appreciation)\b/i.test(lower)) {
    return "event";
  }
  if (/\bpersonal\s+use\b/i.test(lower)) {
    return "personal use";
  }

  if (lower.includes("gift")) return "gift";

  const catalogTag = catalogTermFromMessage(message, options?.catalogTags);
  if (catalogTag && !PRICE_TIER_TERMS.has(catalogTag.toLowerCase())) return catalogTag;
  return undefined;
}

export function extractRecipientFromMessage(message: string): string | undefined {
  for (const pattern of RECIPIENT_PATTERNS) {
    const match = message.match(pattern);
    const who = match?.[1]?.trim();
    const normalized = who?.toLowerCase().replace(/\s+/g, " ").trim();
    if (
      who &&
      normalized &&
      who.length >= 3 &&
      who.length <= 40 &&
      !NON_RECIPIENT_PHRASES.has(normalized) &&
      !/\b(event|giveaways?|decor|awards?|appreciation|personal use|budget|under|below|within)\b/i.test(who)
    ) {
      return who;
    }
  }
  return undefined;
}

export function extractObjectionTypes(message: string): string[] {
  if (!messageSignalsObjection(message)) return [];
  const lower = message.toLowerCase();
  const types: string[] = [];
  if (/expensive|price|cheaper|discount|mahal|වැඩිය|அதிக|cost/.test(lower)) types.push("price");
  if (/ship|deliver|delivery|yanna/.test(lower)) types.push("shipping");
  if (/return|refund|exchange|ප්‍රතිලාභ|திரும்ப/.test(lower)) types.push("returns");
  if (/trust|scam|legit|guarantee|warranty|not sure/.test(lower)) types.push("trust");
  if (types.length === 0) types.push("general");
  return types;
}

export function extractConstraintsFromMessage(
  message: string,
  options?: QualificationExtractionOptions
): string[] {
  const constraints = new Map<string, string>();
  const addConstraint = (value: string) => {
    const normalized = value.trim();
    if (normalized) constraints.set(normalized.toLowerCase(), normalized);
  };
  for (const pattern of GENERIC_CONSTRAINT_PATTERNS) {
    for (const match of message.matchAll(pattern)) {
      const value = match[1]?.trim().toLowerCase();
      if (value) addConstraint(value);
    }
  }
  for (const term of [...(options?.catalogCategories ?? []), ...(options?.catalogTags ?? [])]) {
    const normalized = term.trim();
    if (normalized && !PRICE_TIER_TERMS.has(normalized.toLowerCase()) && messageContainsCatalogTerm(message, normalized)) {
      addConstraint(normalized);
    }
  }
  for (const term of options?.catalogMaterials ?? []) {
    const normalized = term.trim();
    if (normalized && messageContainsCatalogTerm(message, normalized)) {
      addConstraint(normalized);
    }
  }
  for (const term of [
    ...(options?.catalogOccasions ?? []),
    ...(options?.catalogUseCases ?? []),
    ...(options?.catalogStyles ?? []),
  ]) {
    const normalized = term.trim();
    if (normalized && !PRICE_TIER_TERMS.has(normalized.toLowerCase()) && messageContainsCatalogTerm(message, normalized)) {
      addConstraint(normalized);
    }
  }
  return [...constraints.values()];
}

export function extractQualificationFromMessage(
  message: string,
  market: ChatMarket = "default",
  options?: QualificationExtractionOptions
): QualificationState {
  const patch: QualificationState = {};
  const budget = extractBudgetFromMessage(message, market);
  if (budget) patch.budget = budget;

  const category = extractCategoryFromMessage(message, options);
  if (category) patch.category = category;

  const recipient = extractRecipientFromMessage(message);
  if (recipient) patch.recipient = recipient;

  const constraints = extractConstraintsFromMessage(message, options);
  if (constraints.length) patch.constraints = constraints;

  const objections = extractObjectionTypes(message);
  if (objections.length) patch.objectionsRaised = objections;

  const skuMatch = message.match(/\bSKU[:\s-]*([A-Z0-9][A-Z0-9_-]{2,})\b/i);
  if (skuMatch?.[1]) {
    patch.lastComparedSkus = [skuMatch[1].toUpperCase()];
  }

  return patch;
}

export function mergeQualification(
  existing: QualificationState | undefined,
  patch: QualificationState
): QualificationState {
  const base = existing ?? {};
  const merged: QualificationState = { ...base };

  if (patch.budget) {
    merged.budget = { ...base.budget, ...patch.budget };
  }
  if (patch.category) merged.category = patch.category;
  if (patch.recipient) merged.recipient = patch.recipient;
  if (patch.constraints?.length) {
    const constraints = new Map<string, string>();
    for (const constraint of [...(base.constraints ?? []), ...patch.constraints]) {
      const normalized = constraint.trim();
      if (normalized) constraints.set(normalized.toLowerCase(), normalized);
    }
    merged.constraints = [...constraints.values()];
  }
  if (patch.objectionsRaised?.length) {
    merged.objectionsRaised = [
      ...new Set([...(base.objectionsRaised ?? []), ...patch.objectionsRaised]),
    ];
  }
  if (patch.lastComparedSkus?.length) {
    merged.lastComparedSkus = [
      ...new Set([...(base.lastComparedSkus ?? []), ...patch.lastComparedSkus]),
    ].slice(-6);
  }

  return merged;
}

export function qualificationDigest(qualification?: QualificationState): string {
  if (!qualification) return "none yet";
  const parts: string[] = [];
  if (qualification.budget?.max != null) {
    parts.push(`budget up to ${qualification.budget.max}`);
  } else if (qualification.budget?.min != null) {
    parts.push(`budget from ${qualification.budget.min}`);
  }
  if (qualification.category) parts.push(`category: ${qualification.category}`);
  if (qualification.recipient) parts.push(`shopping for: ${qualification.recipient}`);
  if (qualification.constraints?.length) {
    parts.push(`constraints: ${qualification.constraints.join(", ")}`);
  }
  if (qualification.objectionsRaised?.length) {
    parts.push(`concerns: ${qualification.objectionsRaised.join(", ")}`);
  }
  return parts.length ? parts.join("; ") : "none yet";
}

export function missingQualificationSlot(
  funnelStage: string | undefined,
  qualification?: QualificationState
): "budget" | "category" | "recipient" | null {
  if (funnelStage !== "discover") return null;
  if (!qualification?.budget?.max && !qualification?.budget?.min) return "budget";
  if (!qualification?.category) return "category";
  if (!qualification?.recipient) return "recipient";
  return null;
}
