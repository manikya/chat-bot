/**
 * Quick chat quality smoke tests against POST /api/v1/widget/chat (or /api/v1/chat).
 *
 * Usage:
 *   API_URL=https://... WIDGET_API_KEY=pk_live_... node apps/api/scripts/eval-chat.mjs
 */
const API = process.env.API_URL ?? "http://localhost:3001";
const API_KEY = process.env.WIDGET_API_KEY ?? process.env.API_KEY;
const SESSION = `eval-${Date.now()}`;

const CASES = [
  { label: "greeting", message: "Hi there!" },
  { label: "product-search", message: "Show me your best sellers" },
  { label: "faq", message: "What is your return policy?" },
  { label: "mixed-faq-product", message: "Do you deliver to Colombo and what shoes do you have?" },
];

async function chat(message) {
  const path = API_KEY ? "/api/v1/widget/chat" : "/api/v1/chat";
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) headers["X-API-Key"] = API_KEY;

  const body = API_KEY
    ? { sessionId: SESSION, message, metadata: { pageUrl: "https://example.com/products" } }
    : { message, channel: "test", externalUserId: SESSION };

  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
  const data = json.data ?? json;
  return {
    reply: data.reply?.content ?? data.reply ?? "",
    intent: data.intent,
    productCards: data.productCards?.length ?? 0,
    tools: (data.toolResults ?? []).map((t) => t.tool).join(", "),
  };
}

async function main() {
  console.log(`Eval chat @ ${API}\n`);
  let failed = 0;
  for (const c of CASES) {
    try {
      const out = await chat(c.message);
      const preview = out.reply.replace(/\s+/g, " ").slice(0, 160);
      console.log(`[${c.label}] intent=${out.intent ?? "?"} cards=${out.productCards} tools=${out.tools || "-"}`);
      console.log(`  → ${preview}${out.reply.length > 160 ? "…" : ""}\n`);
      if (!out.reply?.trim()) {
        console.error(`  FAIL: empty reply\n`);
        failed++;
      }
    } catch (e) {
      console.error(`[${c.label}] ERROR:`, e.message);
      failed++;
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
