const INTENT_LABELS: Record<string, string> = {
  faq: "FAQ",
  product: "Product",
  checkout: "Checkout",
  greeting: "Greeting",
  unknown: "Unknown",
};

const SUB_INTENT_LABELS: Record<string, string> = {
  product_browse: "Browse",
  product_compare: "Compare",
  product_detail: "Product detail",
  faq_policy: "Policy",
  faq_objection: "Objection",
  cart_review: "Cart review",
  checkout_ready: "Checkout",
  order_status: "Order status",
};

export function intentLabel(intent?: string | null): string {
  if (!intent) return "—";
  return INTENT_LABELS[intent] ?? intent;
}

export function subIntentLabel(subIntent?: string | null): string | null {
  if (!subIntent) return null;
  return SUB_INTENT_LABELS[subIntent] ?? subIntent.replace(/_/g, " ");
}
