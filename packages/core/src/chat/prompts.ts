import type { ChatIntent, ChatSubIntent, FunnelStage, QualificationState, TenantConfig } from "@commercechat/shared";
import type { ScoredChunk } from "../ingest/types";
import type { CartState } from "./cart";
import { formatMoney, languageRulesForMarket, marketFromTimezone, type ChatMarket } from "./locale";
import { missingQualificationSlot, qualificationDigest } from "./qualification";

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
      return "\n- Use search_products with the customer's words as query; pass category when known from shopper preferences\n- After discovery is complete, use one short sentence plus product cards; recommend max 3 in-stock items";
    case "checkout":
      return "\n- Help complete the purchase; confirm cart before sharing checkout links";
    case "greeting":
      return "\n- Welcome briefly; do NOT call search_products or show product cards unless the customer asks for items";
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

function funnelHints(stage?: FunnelStage): string {
  switch (stage) {
    case "discover":
      return "\n- Shopper is browsing: ask ONE useful question to understand intent (recipient, use-case, or budget) — do NOT call search_products yet\n- Keep replies under 35 words; no markdown images";
    case "compare":
      return "\n- Shopper is comparing options: give the key difference in one sentence; suggest 2–3 picks with prices";
    case "objection":
      return "\n- Address the concern using FAQ/policy context; acknowledge before recommending";
    case "cart":
      return "\n- Cart has items: confirm contents; offer checkout when they seem ready";
    case "checkout":
      return "\n- Focus on completing purchase: confirm cart and offer checkout link when appropriate";
    default:
      return "";
  }
}

function subIntentHints(subIntent?: ChatSubIntent): string {
  switch (subIntent) {
    case "product_compare":
      return "\n- Compare options side by side; mention price and stock for each";
    case "product_detail":
      return "\n- Focus on the specific product asked about; use get_product_details when SKU is known";
    case "faq_objection":
      return "\n- Address the concern directly using FAQ/policy context before suggesting products";
    case "cart_review":
      return "\n- Summarize cart contents clearly; ask if they want to checkout";
    case "checkout_ready":
      return "\n- Move toward checkout; confirm cart then offer checkout link";
    case "order_status":
      return "\n- Help with order tracking; use get_order_status when order ID is provided";
    default:
      return "";
  }
}

function qualificationHints(
  funnelStage?: FunnelStage,
  qualification?: QualificationState
): string {
  const digest = qualificationDigest(qualification);
  const missing = missingQualificationSlot(funnelStage, qualification);
  let hint = `\n\nShopper preferences: ${digest}`;
  if (qualification?.budget?.max != null) {
    hint += `\n- When searching products, respect budget max ${qualification.budget.max}`;
  }
  if (missing) {
    hint += `\n- Ask about their ${missing} in one short question if it helps the next recommendation`;
  }
  return hint;
}

export function buildSystemPrompt(
  storeName: string,
  config: TenantConfig,
  ragChunks: ScoredChunk[],
  cart: CartState | null,
  options?: {
    channel?: string;
    timezone?: string;
    intent?: ChatIntent;
    subIntent?: ChatSubIntent;
    funnelStage?: FunnelStage;
    qualification?: QualificationState;
    pageUrl?: string;
  }
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
- Be friendly, proactive, and concise (max ~45 words on web, ~35 on mobile chat)
- Ask at most ONE question; make it the next best sales question
- Before recommending products for broad requests, learn the shopper's use-case first (gift, event, personal use), then budget
- Recommend only after enough context; explain briefly why the picks fit the shopper's use-case, budget, or constraints
- When recommending products, use search_products — do not guess catalog items
- Prefer in-stock items; mention out-of-stock once without add-to-cart
- Do not use markdown images or long spec lists in replies — product cards handle visuals
- Do not repeat the same product in prose and a bullet list
- When showing gift or premium options, lead with relevant in-stock picks within budget
- Confirm before adding to cart
- If unsure, ask a clarifying question${languageRulesForMarket(market)}${channelRules(options?.channel)}${intentHints(options?.intent)}${funnelHints(options?.funnelStage)}${subIntentHints(options?.subIntent)}${qualificationHints(options?.funnelStage, options?.qualification)}`;

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
