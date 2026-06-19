/**
 * Golden chat eval against POST /api/v1/widget/chat (or /api/v1/chat).
 *
 * Usage:
 *   API_URL=http://localhost:3001 WIDGET_API_KEY=pk_live_... node apps/api/scripts/eval-chat/run.mjs
 *   npm run eval:chat
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { assertCase } from "./assertions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = process.env.API_URL ?? "http://localhost:3001";
const API_KEY = process.env.WIDGET_API_KEY ?? process.env.API_KEY;
const cases = JSON.parse(readFileSync(join(__dirname, "cases.json"), "utf8"));

async function chat(message, sessionId) {
  const path = API_KEY ? "/api/v1/widget/chat" : "/api/v1/chat";
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) headers["X-API-Key"] = API_KEY;

  const body = API_KEY
    ? { sessionId, message, metadata: { pageUrl: "https://example.com/products" } }
    : { message, channel: "test", externalUserId: sessionId };

  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
  const data = json.data ?? json;
  const toolProducts =
    data.toolResults?.find((t) => Array.isArray(t.products))?.products ?? [];
  const products = data.productCards?.length ? data.productCards : toolProducts;
  return {
    reply: data.reply?.content ?? data.reply ?? "",
    intent: data.intent,
    subIntent: data.subIntent,
    funnelStage: data.funnelStage,
    productCards: data.productCards?.length ?? 0,
    products,
    productSkus: products.map((p) => p.sku).filter(Boolean),
    productNames: products.map((p) => p.name).filter(Boolean),
    productPrices: products.map((p) => p.price).filter((p) => typeof p === "number"),
    outOfStockProducts: products.filter((p) => p.inStock === false).map((p) => p.sku || p.name),
    suggestedActions: data.suggestedActions?.length ?? 0,
    tools: (data.toolResults ?? []).map((t) => t.tool).join(", "),
  };
}

async function main() {
  const minPass = Number(process.env.EVAL_MIN_PASS_PCT ?? 80);
  console.log(`Eval chat @ ${API} (${cases.length} cases, min pass ${minPass}%)\n`);

  let passed = 0;
  let failed = 0;

  for (const c of cases) {
    try {
      const sessionId = `eval-${Date.now()}-${c.id}`;
      const messages = c.messages ?? [c.message];
      let out;
      for (const message of messages) {
        out = await chat(message, sessionId);
      }
      const failures = assertCase(out, c.expect ?? {});
      const preview = String(out.reply).replace(/\s+/g, " ").slice(0, 140);
      console.log(
        `[${c.id}] intent=${out.intent ?? "?"} sub=${out.subIntent ?? "?"} funnel=${out.funnelStage ?? "?"} ` +
          `cards=${out.productCards} skus=${out.productSkus.join("|") || "-"} ` +
          `actions=${out.suggestedActions} tools=${out.tools || "-"}`
      );
      console.log(`  → ${preview}${String(out.reply).length > 140 ? "…" : ""}`);

      if (failures.length) {
        console.error(`  FAIL: ${failures.join("; ")}\n`);
        failed++;
      } else {
        console.log("  OK\n");
        passed++;
      }
    } catch (e) {
      console.error(`[${c.id}] ERROR:`, e.message);
      failed++;
    }
  }

  const pct = cases.length ? Math.round((passed / cases.length) * 100) : 0;
  console.log(`Result: ${passed}/${cases.length} passed (${pct}%)`);
  const exitFail = failed > 0 || pct < minPass;
  process.exit(exitFail ? 1 : 0);
}

main();
