import type { QualificationState } from "@commercechat/shared";
import type { ChatMarket } from "./locale";
import { messageSignalsObjection } from "./funnel";
import { LK_OBJECTION_KEYWORDS } from "./locale";

const RECIPIENT_PATTERNS = [
  /\b(?:gift\s+)?for\s+(?:my\s+)?([a-z][a-z\s]{2,30}?)(?:\s*[,.!?]|$)/i,
  /\bfor\s+(?:my\s+)?(mom|dad|mother|father|wife|husband|friend|son|daughter|brother|sister)\b/i,
];

const PRICE_TIER_TERMS = new Set(["budget", "budget friendly", "mid range", "premium", "premium picks", "luxury"]);
const GENERIC_NON_RECIPIENT_TERMS = /\b(event|giveaways?|decor|awards?|appreciation|personal use|budget|under|below|within|gift|gifts?|shopping|looking|need|want)\b/i;
const UNKNOWN_PREFERENCE_PATTERN =
  /^(?:i\s+)?(?:have\s+)?(?:no\s+idea|not\s+sure|unsure|don'?t\s+know|dont\s+know|no\s+preference|anything|any)$/i;
const CONCRETE_ITEM_STOP_WORDS = new Set([
  "hi",
  "hello",
  "hey",
  "do",
  "you",
  "have",
  "any",
  "show",
  "me",
  "looking",
  "for",
  "need",
  "want",
  "items",
  "item",
  "products",
  "product",
  "thiyenawada",
  "tiyenawada",
  "thiyenavada",
  "tiyenavada",
  "thiyenawa",
  "tiyenawa",
  "thiyeda",
  "tibeda",
  "nedda",
]);

interface QualificationExtractionOptions {
  catalogCategories?: string[];
  catalogTags?: string[];
  catalogMaterials?: string[];
  catalogOccasions?: string[];
  catalogUseCases?: string[];
  catalogStyles?: string[];
  catalogAliases?: Record<string, string[]>;
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

function cleanRecipientCandidate(value: string): string {
  return value
    .replace(/\b(gifts?|presents?)\b/gi, "")
    .replace(/\b(for|to)\b$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateMatchesAnyCatalogTerm(candidate: string, terms: string[] = []): boolean {
  const normalizedCandidate = candidate.trim();
  if (!normalizedCandidate) return false;
  return terms
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .some(
      (term) =>
        messageContainsCatalogTerm(normalizedCandidate, term) ||
        messageContainsCatalogTerm(term, normalizedCandidate)
    );
}

function isRecipientCandidate(candidate: string, options?: QualificationExtractionOptions): boolean {
  const normalized = candidate.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized || candidate.length < 3 || candidate.length > 40) return false;
  if (GENERIC_NON_RECIPIENT_TERMS.test(candidate)) return false;
  if (
    candidateMatchesAnyCatalogTerm(candidate, [
      ...(options?.catalogOccasions ?? []),
      ...(options?.catalogUseCases ?? []),
      ...(options?.catalogCategories ?? []),
      ...(options?.catalogTags ?? []),
    ])
  ) {
    return false;
  }
  return true;
}

function constraintsToRemoveFromMessage(message: string, options?: QualificationExtractionOptions): string[] {
  const removals = new Map<string, string>();
  const lower = message.toLowerCase();
  const addRemoval = (value: string) => {
    const normalized = value.trim();
    if (normalized) removals.set(normalized.toLowerCase(), normalized);
  };
  for (const term of [
    ...(options?.catalogCategories ?? []),
    ...(options?.catalogTags ?? []),
    ...(options?.catalogMaterials ?? []),
    ...(options?.catalogOccasions ?? []),
    ...(options?.catalogUseCases ?? []),
    ...(options?.catalogStyles ?? []),
  ]) {
    const normalized = term.trim();
    if (normalized && new RegExp(`\\bwithout\\s+${escapeRegExp(normalized)}\\b`, "i").test(message)) {
      addRemoval(normalized);
    }
  }
  if (/\bany\s+style\b|\bany\s+tone\b|\bany\s+occasion\b/i.test(lower)) {
    for (const term of [...(options?.catalogStyles ?? []), ...(options?.catalogOccasions ?? [])]) addRemoval(term);
  }
  if (/\bany\s+material\b/i.test(lower)) {
    for (const term of options?.catalogMaterials ?? []) addRemoval(term);
  }
  return [...removals.values()];
}

function concreteItemPhraseFromMessage(message: string): string | undefined {
  if (UNKNOWN_PREFERENCE_PATTERN.test(message.trim())) return undefined;
  const cleaned = message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .replace(/\b(i'?m|im|i am|i|am|please|pls)\b/g, " ")
    .replace(/\b(do you have|have you got|looking for|need|want|show me|can you show|can i see)\b/g, " ")
    .replace(/\b(thiyenawada|tiyenawada|thiyenavada|tiyenavada|thiyenawa|tiyenawa|thiyeda|tibeda|nedda)\b/g, " ")
    .replace(/\b(items?|products?|options?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;
  if (/\b(best sellers?|recommend|suggest|gift|gifts?|birthday|anniversary|wedding|housewarming|event|personal use|budget|premium|affordable)\b/i.test(cleaned)) {
    return undefined;
  }
  const words = cleaned.split(/\s+/).filter((word) => word && !CONCRETE_ITEM_STOP_WORDS.has(word));
  if (words.length < 1 || words.length > 4) return undefined;
  if (words.every((word) => word.length < 3)) return undefined;
  return words.join(" ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function aliasConstraintsFromMessage(message: string, aliases?: Record<string, string[]>): string[] {
  const constraints = new Map<string, string>();
  for (const [alias, values] of Object.entries(aliases ?? {})) {
    if (!messageContainsCatalogTerm(message, alias)) continue;
    for (const value of values) {
      const normalized = value.trim();
      if (normalized) constraints.set(normalized.toLowerCase(), normalized);
    }
  }
  return [...constraints.values()];
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

export function extractRecipientFromMessage(message: string, options?: QualificationExtractionOptions): string | undefined {
  for (const pattern of RECIPIENT_PATTERNS) {
    const match = message.match(pattern);
    const who = cleanRecipientCandidate(match?.[1]?.trim() ?? "");
    if (who && isRecipientCandidate(who, options)) {
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
  if (UNKNOWN_PREFERENCE_PATTERN.test(message.trim())) return [];
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
  const concreteItemPhrase = concreteItemPhraseFromMessage(message);
  if (concreteItemPhrase && !candidateMatchesAnyCatalogTerm(concreteItemPhrase, [...constraints.values()])) {
    addConstraint(concreteItemPhrase);
  }
  for (const aliasConstraint of aliasConstraintsFromMessage(message, options?.catalogAliases)) {
    addConstraint(aliasConstraint);
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

  const recipient = extractRecipientFromMessage(message, options);
  if (recipient) patch.recipient = recipient;

  const constraints = extractConstraintsFromMessage(message, options);
  if (constraints.length) patch.constraints = constraints;

  const removeConstraints = constraintsToRemoveFromMessage(message, options);
  if (removeConstraints.length) patch.removeConstraints = removeConstraints;

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
    merged.budget =
      patch.budget.min != null && patch.budget.max != null
        ? { min: patch.budget.min, max: patch.budget.max }
        : patch.budget.min != null
          ? { min: patch.budget.min }
          : { max: patch.budget.max };
  }
  if (patch.category) merged.category = patch.category;
  if (patch.recipient) merged.recipient = patch.recipient;
  const removals = new Set((patch.removeConstraints ?? []).map((constraint) => constraint.trim().toLowerCase()).filter(Boolean));
  if (patch.constraints?.length) {
    const constraints = new Map<string, string>();
    for (const constraint of [...(base.constraints ?? []), ...patch.constraints]) {
      const normalized = constraint.trim();
      if (normalized && !removals.has(normalized.toLowerCase())) constraints.set(normalized.toLowerCase(), normalized);
    }
    merged.constraints = [...constraints.values()];
  } else if (removals.size && base.constraints?.length) {
    merged.constraints = base.constraints.filter((constraint) => !removals.has(constraint.trim().toLowerCase()));
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
