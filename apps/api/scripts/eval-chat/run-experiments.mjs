#!/usr/bin/env node
/**
 * Compare chat model/prompt variants against weighted eval criteria.
 *
 * Usage:
 *   API_URL=http://localhost:3001 \
 *   WIDGET_API_KEY=pk_live_... \
 *   ADMIN_ACCESS_TOKEN=ey... \
 *   EVAL_VARIANTS=apps/api/scripts/eval-chat/variants.example.json \
 *   node apps/api/scripts/eval-chat/run-experiments.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { evaluateCase } from "./assertions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = process.env.API_URL ?? "http://localhost:3001";
const API_KEY = process.env.WIDGET_API_KEY ?? process.env.API_KEY;
const ADMIN_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const CASES_PATH = resolve(process.env.EVAL_CASES ?? join(__dirname, "cases.json"));
const CRITERIA_PATH = resolve(process.env.EVAL_CRITERIA ?? join(__dirname, "criteria.json"));
const VARIANTS_PATH = resolve(process.env.EVAL_VARIANTS ?? join(__dirname, "variants.example.json"));
const RESULTS_PATH = process.env.EVAL_RESULTS_PATH ? resolve(process.env.EVAL_RESULTS_PATH) : null;

const cases = JSON.parse(readFileSync(CASES_PATH, "utf8"));
const criteria = JSON.parse(readFileSync(CRITERIA_PATH, "utf8"));
const variants = existsSync(VARIANTS_PATH)
  ? JSON.parse(readFileSync(VARIANTS_PATH, "utf8"))
  : [{ id: "baseline", label: "Current tenant config" }];

function headers(extra = {}) {
  return { "Content-Type": "application/json", ...extra };
}

async function tenantConfig(method, body) {
  if (!ADMIN_TOKEN) throw new Error("ADMIN_ACCESS_TOKEN is required to patch tenant config");
  const res = await fetch(`${API}/api/v1/tenants/me/config`, {
    method,
    headers: headers({ Authorization: `Bearer ${ADMIN_TOKEN}` }),
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} /api/v1/tenants/me/config ${res.status}: ${JSON.stringify(json)}`);
  return json.data ?? json;
}

async function chat(message, sessionId) {
  const path = API_KEY ? "/api/v1/widget/chat" : "/api/v1/chat";
  const requestHeaders = headers();
  if (API_KEY) requestHeaders["X-API-Key"] = API_KEY;
  if (!API_KEY && ADMIN_TOKEN) requestHeaders.Authorization = `Bearer ${ADMIN_TOKEN}`;

  const body = API_KEY
    ? { sessionId, message, metadata: { pageUrl: "https://example.com/products" } }
    : { message, channel: "test", externalUserId: sessionId };

  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
  const data = json.data ?? json;
  const toolProducts = data.toolResults?.find((t) => Array.isArray(t.products))?.products ?? [];
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

async function runVariant(variant) {
  const dimensionTotals = new Map();
  const caseResults = [];
  let passed = 0;
  let totalScore = 0;

  for (const c of cases) {
    const sessionId = `exp-${variant.id}-${Date.now()}-${c.id}`;
    const messages = c.messages ?? [c.message];
    let out;
    for (const message of messages) {
      out = await chat(message, sessionId);
    }
    const evaluation = evaluateCase(out, c.expect ?? {}, criteria);
    if (evaluation.passed) passed += 1;
    totalScore += evaluation.score;

    for (const dim of Object.values(evaluation.dimensions)) {
      if (!dim.applicable) continue;
      const current = dimensionTotals.get(dim.id) ?? { label: dim.label, score: 0, count: 0 };
      current.score += Math.round((dim.passed / dim.applicable) * 100);
      current.count += 1;
      dimensionTotals.set(dim.id, current);
    }

    caseResults.push({
      id: c.id,
      score: evaluation.score,
      passed: evaluation.passed,
      failures: evaluation.failures,
      intent: out.intent,
      subIntent: out.subIntent,
      funnelStage: out.funnelStage,
      productCards: out.productCards,
      tools: out.tools,
      reply: String(out.reply).replace(/\s+/g, " ").slice(0, 240),
    });
  }

  const dimensions = Object.fromEntries(
    [...dimensionTotals.entries()].map(([id, dim]) => [id, Math.round(dim.score / dim.count)])
  );
  return {
    id: variant.id,
    label: variant.label ?? variant.id,
    cases: cases.length,
    passed,
    passPct: Math.round((passed / cases.length) * 100),
    avgScore: Math.round(totalScore / cases.length),
    dimensions,
    caseResults,
  };
}

async function main() {
  console.log(`Chat experiments @ ${API}`);
  console.log(`Cases: ${cases.length} | Variants: ${variants.length}`);
  console.log(`Criteria: ${CRITERIA_PATH}\n`);

  const originalConfig = ADMIN_TOKEN ? await tenantConfig("GET") : null;
  const results = [];

  try {
    for (const variant of variants) {
      console.log(`Running ${variant.id} — ${variant.label ?? variant.id}`);
      if (variant.configPatch) {
        if (!ADMIN_TOKEN) {
          throw new Error(`Variant ${variant.id} has configPatch but ADMIN_ACCESS_TOKEN is not set`);
        }
        await tenantConfig("PATCH", variant.configPatch);
      }
      const result = await runVariant(variant);
      results.push(result);
      console.log(
        `  score=${result.avgScore} pass=${result.passed}/${result.cases} (${result.passPct}%) ` +
          Object.entries(result.dimensions).map(([k, v]) => `${k}=${v}`).join(" ")
      );
      if (originalConfig && variant.configPatch) {
        await tenantConfig("PATCH", originalConfig);
      }
    }
  } finally {
    if (originalConfig) {
      await tenantConfig("PATCH", originalConfig).catch((err) =>
        console.error("Failed to restore tenant config:", err.message)
      );
    }
  }

  results.sort((a, b) => b.avgScore - a.avgScore || b.passPct - a.passPct);
  console.log("\nRanked results:");
  for (const [idx, result] of results.entries()) {
    console.log(`${idx + 1}. ${result.id}: score=${result.avgScore}, pass=${result.passPct}%`);
  }

  if (RESULTS_PATH) {
    writeFileSync(
      RESULTS_PATH,
      JSON.stringify({ api: API, criteria: criteria.version, generatedAt: new Date().toISOString(), results }, null, 2)
    );
    console.log(`\nWrote ${RESULTS_PATH}`);
  }

  const minScore = Number(process.env.EVAL_MIN_SCORE ?? criteria.minScore ?? 85);
  const best = results[0];
  process.exit(best && best.avgScore >= minScore ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
