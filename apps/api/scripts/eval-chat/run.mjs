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
import { evaluateCase } from "./assertions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = process.env.API_URL ?? "http://localhost:3001";
const API_KEY = process.env.WIDGET_API_KEY ?? process.env.API_KEY;
const casesPath = process.env.EVAL_CASES_PATH
  ? join(process.cwd(), process.env.EVAL_CASES_PATH)
  : join(__dirname, "cases.json");
const cases = JSON.parse(readFileSync(casesPath, "utf8"));
const criteria = JSON.parse(readFileSync(join(__dirname, "criteria.json"), "utf8"));

function normalizeTurns(c) {
  if (Array.isArray(c.turns)) {
    return c.turns.map((turn) =>
      typeof turn === "string" ? { user: turn } : { user: turn.user ?? turn.message, expect: turn.expect }
    );
  }
  return (c.messages ?? [c.message]).map((message, index) => ({
    user: message,
    expect: c.turnExpectations?.[index],
  }));
}

function attachConversationContext(outputs) {
  return outputs.map((out, index) => ({
    ...out,
    turnIndex: index + 1,
    previousProductSkus: outputs[index - 1]?.productSkus ?? [],
    allPreviousProductSkus: outputs.slice(0, index).flatMap((item) => item.productSkus ?? []),
    previousReplies: outputs.slice(0, index).map((item) => item.reply).filter(Boolean),
    previousSuggestedActionMessages: outputs
      .slice(0, index)
      .flatMap((item) => item.suggestedActionMessages ?? []),
    conversationOutputs: outputs,
    conversationText: outputs.map((item) => item.reply).filter(Boolean).join("\n"),
  }));
}

function printOutput(c, out, evaluation, prefix = "") {
  const failures = evaluation.failures;
  const preview = String(out.reply).replace(/\s+/g, " ").slice(0, 140);
  console.log(
    `${prefix}[${c.id}] intent=${out.intent ?? "?"} sub=${out.subIntent ?? "?"} funnel=${out.funnelStage ?? "?"} ` +
      `score=${evaluation.score} cards=${out.productCards} skus=${out.productSkus.join("|") || "-"} ` +
      `actions=${out.suggestedActions} tools=${out.tools || "-"}`
  );
  if (out.salesPlan) {
    console.log(
      `  plan trusted=${out.salesPlan.trusted ?? "?"} confidence=${out.salesPlan.confidence ?? "?"} ` +
        `intent=${out.salesPlan.intent ?? "?"} sub=${out.salesPlan.subIntent ?? "?"} stage=${out.salesPlan.funnelStage ?? "?"} ` +
        `action=${out.salesPlan.action ?? "?"} gate=${out.salesPlan.gateProductSearch ?? "?"} ` +
        `move=${out.salesPlan.userMove ?? "?"} close=${out.salesPlan.closeIntent ?? "?"} lang=${out.salesPlan.languageStyle ?? "?"} query=${out.salesPlan.searchQuery ?? "-"} slot=${out.salesPlan.missingSlot ?? "-"}`
    );
  }
  console.log(`  -> ${preview}${String(out.reply).length > 140 ? "..." : ""}`);
  if (out.retrievedChunks.length) {
    for (const chunk of out.retrievedChunks.slice(0, 5)) {
      const label = [
        chunk.sourceType,
        chunk.sku,
        chunk.title ?? chunk.section,
        chunk.score != null ? `score=${chunk.score}` : undefined,
      ]
        .filter(Boolean)
        .join(" ");
      const contextPreview = String(chunk.textPreview ?? "").replace(/\s+/g, " ").slice(0, 120);
      console.log(`  RAG ${label}: ${contextPreview}${contextPreview.length >= 120 ? "..." : ""}`);
    }
  } else {
    console.log("  RAG -");
  }

  if (failures.length) {
    console.error(`  FAIL: ${failures.join("; ")}`);
  } else {
    console.log("  OK");
  }
}

function combineEvaluations(evaluations) {
  const failures = evaluations.flatMap((item) => item.evaluation.failures.map((failure) => `${item.label}: ${failure}`));
  const score = evaluations.length
    ? Math.round(evaluations.reduce((sum, item) => sum + item.evaluation.score, 0) / evaluations.length)
    : 100;
  return { failures, score };
}

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
    suggestedActionLabels: (data.suggestedActions ?? []).map((a) => a.label).filter(Boolean),
    suggestedActionMessages: (data.suggestedActions ?? []).map((a) => a.message).filter(Boolean),
    tools: (data.toolResults ?? []).map((t) => t.tool).join(", "),
    retrievedChunks: data.retrievedChunks ?? [],
    salesPlan: data.salesPlan ?? null,
    agentTrace: data.agentTrace ?? null,
  };
}

async function main() {
  const minPass = Number(process.env.EVAL_MIN_PASS_PCT ?? 80);
  const minScore = Number(process.env.EVAL_MIN_SCORE ?? criteria.minScore ?? 85);
  console.log(`Eval chat @ ${API} (${cases.length} cases, min pass ${minPass}%, min score ${minScore})`);
  console.log(`Cases: ${casesPath}\n`);

  let passed = 0;
  let failed = 0;
  let totalScore = 0;
  const dimensionTotals = new Map();

  for (const c of cases) {
    try {
      const sessionId = `eval-${Date.now()}-${c.id}`;
      const turns = normalizeTurns(c);
      const outputs = [];
      for (const turn of turns) {
        const out = await chat(turn.user, sessionId);
        outputs.push(out);
      }
      const contextualOutputs = attachConversationContext(outputs);
      const out = contextualOutputs.at(-1);
      const turnEvaluations = [];
      for (let i = 0; i < turns.length; i++) {
        if (!turns[i].expect) continue;
        turnEvaluations.push({
          label: `turn ${i + 1}`,
          evaluation: evaluateCase(contextualOutputs[i], turns[i].expect, criteria),
          out: contextualOutputs[i],
          turn: turns[i],
        });
      }

      const finalEvaluation = evaluateCase(out, c.expect ?? {}, criteria);
      const evaluations = [
        ...turnEvaluations,
        { label: "final", evaluation: finalEvaluation },
      ];
      const combined = combineEvaluations(evaluations);
      totalScore += combined.score;
      for (const { evaluation } of evaluations) {
        for (const dim of Object.values(evaluation.dimensions)) {
          if (!dim.applicable) continue;
          const current = dimensionTotals.get(dim.id) ?? { label: dim.label, score: 0, count: 0 };
          current.score += Math.round((dim.passed / dim.applicable) * 100);
          current.count += 1;
          dimensionTotals.set(dim.id, current);
        }
      }
      for (const item of turnEvaluations) {
        printOutput(c, item.out, item.evaluation, `turn ${item.out.turnIndex} `);
      }
      printOutput(c, out, finalEvaluation);

      if (combined.failures.length) {
        console.error(`  CASE FAIL: ${combined.failures.join("; ")}\n`);
        failed++;
      } else {
        console.log(`  CASE OK score=${combined.score}\n`);
        passed++;
      }
    } catch (e) {
      console.error(`[${c.id}] ERROR:`, e.message);
      failed++;
    }
  }

  const pct = cases.length ? Math.round((passed / cases.length) * 100) : 0;
  const avgScore = cases.length ? Math.round(totalScore / cases.length) : 0;
  console.log("Dimension scores:");
  for (const [, dim] of dimensionTotals) {
    console.log(`- ${dim.label}: ${Math.round(dim.score / dim.count)}`);
  }
  console.log(`Result: ${passed}/${cases.length} passed (${pct}%), average score ${avgScore}`);
  const exitFail = failed > 0 || pct < minPass || avgScore < minScore;
  process.exit(exitFail ? 1 : 0);
}

main();
