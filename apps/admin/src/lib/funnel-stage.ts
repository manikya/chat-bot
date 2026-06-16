const LABELS: Record<string, string> = {
  discover: "Discover",
  compare: "Compare",
  objection: "Objection",
  cart: "Cart",
  checkout: "Checkout",
};

export function funnelStageLabel(stage?: string | null): string {
  if (!stage) return "Discover";
  return LABELS[stage] ?? stage;
}
