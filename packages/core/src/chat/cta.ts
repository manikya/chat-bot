import type { ChatSubIntent, FunnelStage, WidgetAction } from "@commercechat/shared";
import type { CartState } from "./cart";
import type { SearchProductHit } from "./product-reply";
import { extractProductHitsFromTools } from "./product-reply";

function formatPriceLabel(price: number, currency?: string): string {
  const code = currency || "USD";
  try {
    return new Intl.NumberFormat(code === "LKR" ? "en-LK" : "en", {
      style: "currency",
      currency: code,
    }).format(price);
  } catch {
    return `${code} ${price}`;
  }
}

function productActions(products: SearchProductHit[], max = 3): WidgetAction[] {
  return products.slice(0, max).map((p) => ({
    type: "product" as const,
    sku: p.sku,
    label: `${p.name} — ${formatPriceLabel(p.price, p.currency)}`,
    action: "add_to_cart" as const,
  }));
}

export function buildSuggestedCtas(input: {
  funnelStage?: FunnelStage;
  subIntent?: ChatSubIntent;
  toolResults: Array<{ tool: string; success: boolean; result: unknown }>;
  cart: CartState | null;
  channel?: string;
}): WidgetAction[] {
  const { funnelStage, subIntent, toolResults, cart, channel } = input;
  const products = extractProductHitsFromTools(toolResults);
  const hasCards = products.length > 0;
  const cartCount = cart?.items.length ?? 0;

  if (subIntent === "checkout_ready" || funnelStage === "checkout") {
    return [
      {
        type: "checkout",
        label: "Get checkout link",
        action: "checkout",
        message: "I'd like to checkout",
      },
    ];
  }

  if (subIntent === "cart_review" || funnelStage === "cart" || cartCount > 0) {
    const actions: WidgetAction[] = [
      {
        type: "checkout",
        label: "Checkout now",
        action: "checkout",
        message: "I'm ready to checkout",
      },
    ];
    if (!hasCards && cartCount > 0) {
      actions.unshift({
        type: "message",
        label: "What's in my cart?",
        message: "What's in my cart?",
      });
    }
    return actions.slice(0, 3);
  }

  if (subIntent === "faq_objection" || funnelStage === "objection") {
    return [
      {
        type: "message",
        label: "View return policy",
        message: "What is your return policy?",
      },
      {
        type: "message",
        label: "Shipping info",
        message: "How does shipping work?",
      },
    ];
  }

  if (subIntent === "product_compare" || funnelStage === "compare") {
    if (products.length) return productActions(products, 3);
    return [
      {
        type: "message",
        label: "Show best sellers",
        message: "Show me your best sellers",
      },
    ];
  }

  if (funnelStage === "discover" || subIntent === "product_browse") {
    if (hasCards && channel === "web") {
      return cartCount > 0
        ? [{ type: "checkout", label: "Checkout", action: "checkout", message: "Checkout" }]
        : [];
    }
    if (products.length) return productActions(products, 2);
    return [
      {
        type: "message",
        label: "Show best sellers",
        message: "Show me your best sellers",
      },
      {
        type: "message",
        label: "What's on sale?",
        message: "Do you have any discounts or offers?",
      },
    ];
  }

  if (products.length && !hasCards) return productActions(products, 3);
  return [];
}

export function appendCtaPromptLine(reply: string, ctas: WidgetAction[]): string {
  const trimmed = reply.trim();
  if (!trimmed || !ctas.length) return reply;
  if (trimmed.endsWith("?")) return reply;

  const primary = ctas[0]!;
  if (primary.action === "add_to_cart" && primary.sku) {
    const name = primary.label.split(" — ")[0] ?? "this item";
    return `${trimmed}\n\nWant me to add ${name} to your cart?`;
  }
  if (primary.action === "checkout") {
    return `${trimmed}\n\nReady to checkout when you are — tap Checkout below.`;
  }
  if (primary.type === "message" && primary.message) {
    return trimmed;
  }
  return reply;
}
