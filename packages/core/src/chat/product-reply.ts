import { formatMoney } from "./locale";

export interface SearchProductHit {
  sku: string;
  name: string;
  price: number;
  currency?: string;
  inStock?: boolean;
}

export function extractSearchProducts(
  toolResults: Array<{ tool: string; success: boolean; result: unknown }>
): SearchProductHit[] {
  const search = toolResults.find((t) => t.tool === "search_products" && t.success);
  if (!search) return [];
  const data = search.result as { products?: SearchProductHit[] };
  return data.products ?? [];
}

function formatProductLine(p: SearchProductHit, currency: string, channel?: string): string {
  const price = p.price > 0 ? formatMoney(p.price, p.currency ?? currency) : "price on request";
  const stock = p.inStock === false ? " (out of stock)" : "";
  if (channel === "whatsapp" || channel === "messenger" || channel === "instagram") {
    return `- ${p.name}: ${price}${stock}`;
  }
  return `• ${p.name} — ${price}${stock}`;
}

export function formatProductListForReply(
  products: SearchProductHit[],
  currency: string,
  options?: { channel?: string; max?: number }
): string {
  const max = options?.max ?? 5;
  const list = products.slice(0, max).map((p) => formatProductLine(p, currency, options?.channel));
  if (!list.length) return "";
  return `Here are some options:\n\n${list.join("\n")}`;
}

function replyAlreadyMentionsProducts(reply: string, products: SearchProductHit[]): boolean {
  const lower = reply.toLowerCase();
  return products.some((p) => {
    const name = p.name.toLowerCase().trim();
    if (name.length < 4) return false;
    const short = name.slice(0, Math.min(name.length, 24));
    return lower.includes(short);
  });
}

export function enrichReplyWithProductSearch(
  reply: string,
  toolResults: Array<{ tool: string; success: boolean; result: unknown }>,
  currency: string,
  options?: { channel?: string }
): string {
  const products = extractSearchProducts(toolResults);
  if (!products.length) return reply;
  if (reply.trim() && replyAlreadyMentionsProducts(reply, products) && reply.length > 60) {
    return reply;
  }
  const summary = formatProductListForReply(products, currency, options);
  if (!reply.trim()) return summary;
  if (reply.toLowerCase().includes("here are some options")) return reply;
  return `${reply.trim()}\n\n${summary}`;
}
