import type { ChatIntent, TenantConfig } from "@commercechat/shared";
import type { ScoredChunk } from "../ingest/types";
import type { CartState } from "./cart";
import { formatMoney, languageRulesForMarket, marketFromTimezone, type ChatMarket } from "./locale";

function channelRules(channel?: string): string {
  if (channel === "messenger" || channel === "whatsapp" || channel === "instagram") {
    return "\n- Use plain text only — no markdown (no * or ** around product names)\n- Keep replies brief for mobile chat";
  }
  return "";
}

function intentHints(intent?: ChatIntent): string {
  switch (intent) {
    case "faq":
      return "\n- Answer policy and shipping questions from FAQ/website context first";
    case "product":
      return "\n- Recommend products from catalog search; include price and stock when available";
    case "checkout":
      return "\n- Help complete the purchase; confirm cart before sharing checkout links";
    case "greeting":
      return "\n- Welcome briefly; offer to help find products if they seem ready to shop";
    default:
      return "";
  }
}

function formatCartSummary(cart: CartState | null, currency: string): string {
  if (!cart?.items.length) return "empty";
  return cart.items
    .map((i) => `${i.name} x${i.quantity} (${formatMoney(i.unitPrice, currency)})`)
    .join(", ");
}

export function buildSystemPrompt(
  storeName: string,
  config: TenantConfig,
  ragChunks: ScoredChunk[],
  cart: CartState | null,
  options?: { channel?: string; timezone?: string; intent?: ChatIntent; pageUrl?: string }
): string {
  const market: ChatMarket = marketFromTimezone(options?.timezone);
  const currency = config.commerceConnector?.currency ?? (market === "lk" ? "LKR" : "USD");
  const base = config.prompts.systemPrompt.replace(/\{\{storeName\}\}/g, storeName);

  const rules = `
Rules:
- Answer using ONLY the provided context and tool results
- NEVER invent product names, SKUs, prices, stock status, or policies
- If the answer is not in context or tools, say you are not sure and ask a clarifying question
- For shipping, returns, and policies: prefer website and FAQ sources
- When conversation examples (Customer/Owner pairs) appear in context, match the owner's tone and phrasing
- Be friendly and concise
- When recommending products, use search_products — do not guess catalog items
- Confirm before adding to cart
- If unsure, ask a clarifying question${languageRulesForMarket(market)}${channelRules(options?.channel)}${intentHints(options?.intent)}`;

  const pageHint = options?.pageUrl
    ? `\n\nCustomer is browsing: ${options.pageUrl}`
    : "";

  const context =
    ragChunks.length > 0
      ? ragChunks
          .slice(0, 5)
          .map(
            (h, i) =>
              `[${i + 1}] ${h.chunk.metadata.title ?? h.chunk.metadata.section ?? "Source"}: ${h.chunk.text.slice(0, 800)}`
          )
          .join("\n\n")
      : "No knowledge base context retrieved for this query.";

  return `${base}\n${rules}${pageHint}\n\nContext:\n${context}\n\nCurrent cart: ${formatCartSummary(cart, currency)}`;
}
