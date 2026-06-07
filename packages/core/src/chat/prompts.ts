import type { TenantConfig } from "@commercechat/shared";
import type { ScoredChunk } from "../ingest/types";
import type { CartState } from "./cart";

export function buildSystemPrompt(
  storeName: string,
  config: TenantConfig,
  ragChunks: ScoredChunk[],
  cart: CartState | null
): string {
  const base = config.prompts.systemPrompt.replace(/\{\{storeName\}\}/g, storeName);

  const rules = `
Rules:
- Answer using ONLY the provided context and tool results
- For shipping, returns, and policies: prefer website sources
- Be friendly and concise
- When recommending products, use search_products — do not invent SKUs or prices
- Confirm before adding to cart
- If unsure, ask a clarifying question`;

  const context =
    ragChunks.length > 0
      ? ragChunks
          .slice(0, 5)
          .map((h, i) => `[${i + 1}] ${h.chunk.metadata.title ?? h.chunk.metadata.section ?? "Source"}: ${h.chunk.text.slice(0, 500)}`)
          .join("\n\n")
      : "No knowledge base context retrieved for this query.";

  const cartSummary = cart?.items.length
    ? cart.items.map((i) => `${i.name} x${i.quantity} ($${i.unitPrice})`).join(", ")
    : "empty";

  return `${base}\n${rules}\n\nContext:\n${context}\n\nCurrent cart: ${cartSummary}`;
}
