type Qualification = {
  budget?: { min?: number; max?: number };
  category?: string;
  recipient?: string;
  constraints?: string[];
  objectionsRaised?: string[];
};

export function formatQualificationSummary(qualification?: Qualification): string | null {
  if (!qualification) return null;
  const parts: string[] = [];
  if (qualification.budget?.max != null) parts.push(`Budget ≤ ${qualification.budget.max}`);
  if (qualification.budget?.min != null && qualification.budget.max == null) {
    parts.push(`Budget ≥ ${qualification.budget.min}`);
  }
  if (qualification.category) parts.push(`Category: ${qualification.category}`);
  if (qualification.recipient) parts.push(`For: ${qualification.recipient}`);
  if (qualification.objectionsRaised?.length) {
    parts.push(`Concerns: ${qualification.objectionsRaised.join(", ")}`);
  }
  return parts.length ? parts.join(" · ") : null;
}
