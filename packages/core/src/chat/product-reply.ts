import { formatMoney } from "./locale";

export interface SearchProductHit {
  sku: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  inStock?: boolean;
  imageUrl?: string;
  imageUrls?: string[];
  url?: string;
  category?: string;
  categories?: string[];
  tags?: string;
  material?: string;
  occasion?: string;
  recipient?: string;
  compatibility?: string;
  bundles?: string;
  variants?: string;
  matchReasons?: string[];
}

export function extractSearchProducts(
  toolResults: Array<{ tool: string; success: boolean; result: unknown }>
): SearchProductHit[] {
  return extractProductHitsFromTools(toolResults);
}

export function extractProductHitsFromTools(
  toolResults: Array<{ tool: string; success: boolean; result: unknown }>
): SearchProductHit[] {
  for (const name of ["search_products", "compare_products", "get_related_products"] as const) {
    const hit = toolResults.find((t) => t.tool === name && t.success);
    if (!hit) continue;
    const data = hit.result as { products?: SearchProductHit[] };
    if (data.products?.length) return data.products;
  }
  return [];
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
  const max = options?.max ?? 3;
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

/** Strip markdown images and links clutter — product cards carry visuals on web. */
export function sanitizeReplyText(reply: string, channel?: string): string {
  let text = reply.trim();
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  if (channel === "web") {
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1");
  }
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

function wordLimitForChannel(channel?: string) {
  if (channel === "whatsapp" || channel === "messenger" || channel === "instagram") return 35;
  return 45;
}

function trimWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ").replace(/[,.!?;:]+$/, "")}.`;
}

export function compactReplyText(
  reply: string,
  options?: { channel?: string; maxWords?: number; maxQuestions?: number }
): string {
  const maxWords = options?.maxWords ?? wordLimitForChannel(options?.channel);
  const maxQuestions = options?.maxQuestions ?? 1;
  let text = sanitizeReplyText(reply, options?.channel)
    .replace(/\n{2,}/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return text;

  const sentences = text.match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const kept: string[] = [];
  let questionCount = 0;
  for (const sentence of sentences) {
    const isQuestion = sentence.endsWith("?");
    if (isQuestion && questionCount >= maxQuestions) continue;
    if (isQuestion) questionCount++;
    kept.push(sentence);
    if (kept.join(" ").split(/\s+/).length >= maxWords) break;
    if (kept.length >= 2 && questionCount > 0) break;
  }

  return trimWords(kept.join(" "), maxWords);
}

export function enrichReplyWithProductSearch(
  reply: string,
  toolResults: Array<{ tool: string; success: boolean; result: unknown }>,
  currency: string,
  options?: { channel?: string; skipListAppend?: boolean }
): string {
  const cleaned = sanitizeReplyText(reply, options?.channel);
  if (options?.skipListAppend || options?.channel === "web") {
    return cleaned;
  }

  const products = extractProductHitsFromTools(toolResults);
  if (!products.length) return cleaned;
  if (cleaned.trim() && replyAlreadyMentionsProducts(cleaned, products) && cleaned.length > 60) {
    return cleaned;
  }
  const summary = formatProductListForReply(products, currency, options);
  if (!cleaned.trim()) return summary;
  if (cleaned.toLowerCase().includes("here are some options")) return cleaned;
  return `${cleaned}\n\n${summary}`;
}

export function productSearchWasEmpty(
  toolResults: Array<{ tool: string; success: boolean; result: unknown }>
): boolean {
  return toolResults.some((t) => {
    if (!["search_products", "compare_products", "get_related_products"].includes(t.tool)) return false;
    if (!t.success) return false;
    const data = t.result as { products?: unknown[]; totalFound?: number };
    return data.totalFound === 0 || (Array.isArray(data.products) && data.products.length === 0);
  });
}

export function buildNoProductResultsReply(input: {
  query: string;
  category?: string;
  maxPrice?: number;
  minPrice?: number;
  currency: string;
  channel?: string;
}): string {
  const parts: string[] = [];
  if (input.category) parts.push(input.category);
  if (input.maxPrice != null) parts.push(`under ${formatMoney(input.maxPrice, input.currency)}`);
  if (input.minPrice != null) parts.push(`from ${formatMoney(input.minPrice, input.currency)}`);
  const scope = parts.length ? ` matching ${parts.join(", ")}` : "";
  const ending =
    input.channel === "whatsapp" || input.channel === "messenger" || input.channel === "instagram"
      ? "Would you like me to try a broader search or show best sellers?"
      : "Want me to broaden the search or show best sellers instead?";
  return `I couldn't find in-stock products${scope} for that search. ${ending}`;
}
