const DEFAULT_CRITERIA = {
  dimensions: [
    { id: "routing", label: "Intent and funnel routing", weight: 20 },
    { id: "response", label: "Response quality", weight: 25 },
    { id: "commerce", label: "Commerce behavior", weight: 30 },
    { id: "engagement", label: "Guided next step", weight: 15 },
    { id: "reliability", label: "Reliability", weight: 10 },
  ],
};

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function questionCount(text) {
  return (String(text || "").match(/\?/g) ?? []).length;
}

const CHECKS = [
  {
    id: "nonEmptyReply",
    dimension: "reliability",
    applies: (expect) => expect.nonEmptyReply,
    run: (out) => String(out.reply || "").trim() ? null : "empty reply",
  },
  {
    id: "intent",
    dimension: "routing",
    applies: (expect) => expect.intent,
    run: (out, expect) => out.intent === expect.intent ? null : `intent expected ${expect.intent}, got ${out.intent ?? "?"}`,
  },
  {
    id: "subIntent",
    dimension: "routing",
    applies: (expect) => expect.subIntent,
    run: (out, expect) =>
      out.subIntent === expect.subIntent ? null : `subIntent expected ${expect.subIntent}, got ${out.subIntent ?? "?"}`,
  },
  {
    id: "funnelStage",
    dimension: "routing",
    applies: (expect) => expect.funnelStage,
    run: (out, expect) => {
      const allowed = Array.isArray(expect.funnelStage) ? expect.funnelStage : [expect.funnelStage];
      return allowed.includes(out.funnelStage)
        ? null
        : `funnelStage expected one of ${allowed.join("|")}, got ${out.funnelStage ?? "?"}`;
    },
  },
  {
    id: "toolsIncludes",
    dimension: "commerce",
    applies: (expect) => expect.toolsIncludes,
    run: (out, expect) => {
      const tools = String(out.tools || "");
      const missing = expect.toolsIncludes.filter((t) => !tools.includes(t));
      return missing.length ? `missing tool ${missing.join(", ")}` : null;
    },
  },
  {
    id: "replyMinLength",
    dimension: "response",
    applies: (expect) => expect.replyMinLength,
    run: (out, expect) =>
      String(out.reply || "").length >= expect.replyMinLength
        ? null
        : `reply shorter than ${expect.replyMinLength}`,
  },
  {
    id: "maxReplyWords",
    dimension: "response",
    applies: (expect) => expect.maxReplyWords != null,
    run: (out, expect) => {
      const words = wordCount(out.reply);
      return words <= expect.maxReplyWords
        ? null
        : `reply expected <= ${expect.maxReplyWords} words, got ${words}`;
    },
  },
  {
    id: "maxQuestions",
    dimension: "engagement",
    applies: (expect) => expect.maxQuestions != null,
    run: (out, expect) => {
      const questions = questionCount(out.reply);
      return questions <= expect.maxQuestions
        ? null
        : `reply expected <= ${expect.maxQuestions} questions, got ${questions}`;
    },
  },
  {
    id: "replyIncludes",
    dimension: "response",
    applies: (expect) => expect.replyIncludes,
    run: (out, expect) => {
      const reply = String(out.reply || "").toLowerCase();
      const missing = expect.replyIncludes.filter((text) => !reply.includes(String(text).toLowerCase()));
      return missing.length ? `reply missing ${missing.map((text) => `"${text}"`).join(", ")}` : null;
    },
  },
  {
    id: "replyExcludes",
    dimension: "response",
    applies: (expect) => expect.replyExcludes,
    run: (out, expect) => {
      const reply = String(out.reply || "").toLowerCase();
      const present = expect.replyExcludes.filter((text) => reply.includes(String(text).toLowerCase()));
      return present.length ? `reply should not include ${present.map((text) => `"${text}"`).join(", ")}` : null;
    },
  },
  {
    id: "maxProductCards",
    dimension: "commerce",
    applies: (expect) => expect.maxProductCards != null,
    run: (out, expect) =>
      Number(out.productCards || 0) <= expect.maxProductCards
        ? null
        : `productCards expected <= ${expect.maxProductCards}, got ${out.productCards ?? 0}`,
  },
  {
    id: "minProductCards",
    dimension: "commerce",
    applies: (expect) => expect.minProductCards != null,
    run: (out, expect) =>
      Number(out.productCards || 0) >= expect.minProductCards
        ? null
        : `productCards expected >= ${expect.minProductCards}, got ${out.productCards ?? 0}`,
  },
  {
    id: "expectedProductSkus",
    dimension: "commerce",
    applies: (expect) => expect.expectedProductSkus,
    run: (out, expect) => {
      const skus = new Set(out.productSkus ?? []);
      const missing = expect.expectedProductSkus.filter((sku) => !skus.has(sku));
      return missing.length ? `missing expected product SKU ${missing.join(", ")}` : null;
    },
  },
  {
    id: "noRepeatedProductSkusFromPreviousTurn",
    dimension: "commerce",
    applies: (expect) => expect.noRepeatedProductSkusFromPreviousTurn,
    run: (out) => {
      const previous = new Set(out.previousProductSkus ?? []);
      const repeated = (out.productSkus ?? []).filter((sku) => previous.has(sku));
      return repeated.length ? `repeated product SKU from previous turn ${repeated.join(", ")}` : null;
    },
  },
  {
    id: "productNameIncludesAny",
    dimension: "commerce",
    applies: (expect) => expect.productNameIncludesAny,
    run: (out, expect) => {
      const names = (out.productNames ?? []).join(" ").toLowerCase();
      const matched = expect.productNameIncludesAny.some((term) => names.includes(String(term).toLowerCase()));
      return matched ? null : `product names missing any of ${expect.productNameIncludesAny.join("|")}`;
    },
  },
  {
    id: "maxProductPrice",
    dimension: "commerce",
    applies: (expect) => expect.maxProductPrice != null,
    run: (out, expect) => {
      const tooExpensive = (out.products ?? []).filter((p) => Number(p.price) > expect.maxProductPrice);
      return tooExpensive.length
        ? `products above ${expect.maxProductPrice}: ${tooExpensive.map((p) => `${p.sku ?? p.name}:${p.price}`).join(", ")}`
        : null;
    },
  },
  {
    id: "minProductPrice",
    dimension: "commerce",
    applies: (expect) => expect.minProductPrice != null,
    run: (out, expect) => {
      const tooCheap = (out.products ?? []).filter((p) => Number(p.price) < expect.minProductPrice);
      return tooCheap.length
        ? `products below ${expect.minProductPrice}: ${tooCheap.map((p) => `${p.sku ?? p.name}:${p.price}`).join(", ")}`
        : null;
    },
  },
  {
    id: "noOutOfStockProducts",
    dimension: "commerce",
    applies: (expect) => expect.noOutOfStockProducts,
    run: (out) => {
      const outOfStock = out.outOfStockProducts ?? [];
      return outOfStock.length ? `out-of-stock products returned: ${outOfStock.join(", ")}` : null;
    },
  },
  {
    id: "minSuggestedActions",
    dimension: "engagement",
    applies: (expect) => expect.minSuggestedActions != null,
    run: (out, expect) =>
      Number(out.suggestedActions || 0) >= expect.minSuggestedActions
        ? null
        : `suggestedActions expected >= ${expect.minSuggestedActions}, got ${out.suggestedActions ?? 0}`,
  },
  {
    id: "suggestedActionIncludes",
    dimension: "engagement",
    applies: (expect) => expect.suggestedActionIncludes,
    run: (out, expect) => {
      const text = [...(out.suggestedActionLabels ?? []), ...(out.suggestedActionMessages ?? [])]
        .join(" ")
        .toLowerCase();
      const missing = expect.suggestedActionIncludes.filter((term) => !text.includes(String(term).toLowerCase()));
      return missing.length ? `suggested actions missing ${missing.join(", ")}` : null;
    },
  },
  {
    id: "suggestedActionExcludes",
    dimension: "engagement",
    applies: (expect) => expect.suggestedActionExcludes,
    run: (out, expect) => {
      const text = [...(out.suggestedActionLabels ?? []), ...(out.suggestedActionMessages ?? [])]
        .join(" ")
        .toLowerCase();
      const present = expect.suggestedActionExcludes.filter((term) => text.includes(String(term).toLowerCase()));
      return present.length ? `suggested actions should not include ${present.join(", ")}` : null;
    },
  },
  {
    id: "minRetrievedChunks",
    dimension: "reliability",
    applies: (expect) => expect.minRetrievedChunks != null,
    run: (out, expect) =>
      Number(out.retrievedChunks?.length ?? 0) >= expect.minRetrievedChunks
        ? null
        : `retrievedChunks expected >= ${expect.minRetrievedChunks}, got ${out.retrievedChunks?.length ?? 0}`,
  },
  {
    id: "retrievedSourceTypes",
    dimension: "commerce",
    applies: (expect) => expect.retrievedSourceTypes,
    run: (out, expect) => {
      const sourceTypes = new Set((out.retrievedChunks ?? []).map((chunk) => chunk.sourceType).filter(Boolean));
      const missing = expect.retrievedSourceTypes.filter((sourceType) => !sourceTypes.has(sourceType));
      return missing.length ? `retrieved chunks missing source types ${missing.join(", ")}` : null;
    },
  },
  {
    id: "retrievedSkusInclude",
    dimension: "commerce",
    applies: (expect) => expect.retrievedSkusInclude,
    run: (out, expect) => {
      const skus = new Set((out.retrievedChunks ?? []).map((chunk) => chunk.sku).filter(Boolean));
      const missing = expect.retrievedSkusInclude.filter((sku) => !skus.has(sku));
      return missing.length ? `retrieved chunks missing SKU ${missing.join(", ")}` : null;
    },
  },
  {
    id: "retrievedTextIncludesAny",
    dimension: "response",
    applies: (expect) => expect.retrievedTextIncludesAny,
    run: (out, expect) => {
      const text = (out.retrievedChunks ?? [])
        .map((chunk) => [chunk.title, chunk.section, chunk.sku, chunk.textPreview].filter(Boolean).join(" "))
        .join(" ")
        .toLowerCase();
      const matched = expect.retrievedTextIncludesAny.some((term) => text.includes(String(term).toLowerCase()));
      return matched ? null : `retrieved chunks missing any of ${expect.retrievedTextIncludesAny.join("|")}`;
    },
  },
  {
    id: "salesPlanTrusted",
    dimension: "routing",
    applies: (expect) => expect.salesPlanTrusted != null,
    run: (out, expect) =>
      Boolean(out.salesPlan?.trusted) === Boolean(expect.salesPlanTrusted)
        ? null
        : `salesPlan trusted expected ${expect.salesPlanTrusted}, got ${out.salesPlan?.trusted ?? "?"}`,
  },
  {
    id: "salesPlanSearchIncludes",
    dimension: "routing",
    applies: (expect) => expect.salesPlanSearchIncludes,
    run: (out, expect) => {
      const query = String(out.salesPlan?.searchQuery ?? "").toLowerCase();
      const missing = expect.salesPlanSearchIncludes.filter((term) => !query.includes(String(term).toLowerCase()));
      return missing.length ? `salesPlan searchQuery missing ${missing.join(", ")}` : null;
    },
  },
  {
    id: "salesPlanIntent",
    dimension: "routing",
    applies: (expect) => expect.salesPlanIntent,
    run: (out, expect) =>
      out.salesPlan?.intent === expect.salesPlanIntent
        ? null
        : `salesPlan intent expected ${expect.salesPlanIntent}, got ${out.salesPlan?.intent ?? "?"}`,
  },
  {
    id: "salesPlanSubIntent",
    dimension: "routing",
    applies: (expect) => expect.salesPlanSubIntent,
    run: (out, expect) =>
      out.salesPlan?.subIntent === expect.salesPlanSubIntent
        ? null
        : `salesPlan subIntent expected ${expect.salesPlanSubIntent}, got ${out.salesPlan?.subIntent ?? "?"}`,
  },
  {
    id: "salesPlanFunnelStage",
    dimension: "routing",
    applies: (expect) => expect.salesPlanFunnelStage,
    run: (out, expect) => {
      const allowed = Array.isArray(expect.salesPlanFunnelStage) ? expect.salesPlanFunnelStage : [expect.salesPlanFunnelStage];
      return allowed.includes(out.salesPlan?.funnelStage)
        ? null
        : `salesPlan funnelStage expected one of ${allowed.join("|")}, got ${out.salesPlan?.funnelStage ?? "?"}`;
    },
  },
  {
    id: "salesPlanAction",
    dimension: "routing",
    applies: (expect) => expect.salesPlanAction,
    run: (out, expect) => {
      const allowed = Array.isArray(expect.salesPlanAction) ? expect.salesPlanAction : [expect.salesPlanAction];
      return allowed.includes(out.salesPlan?.action)
        ? null
        : `salesPlan action expected one of ${allowed.join("|")}, got ${out.salesPlan?.action ?? "?"}`;
    },
  },
  {
    id: "salesPlanUserMove",
    dimension: "routing",
    applies: (expect) => expect.salesPlanUserMove,
    run: (out, expect) => {
      const allowed = Array.isArray(expect.salesPlanUserMove) ? expect.salesPlanUserMove : [expect.salesPlanUserMove];
      return allowed.includes(out.salesPlan?.userMove)
        ? null
        : `salesPlan userMove expected one of ${allowed.join("|")}, got ${out.salesPlan?.userMove ?? "?"}`;
    },
  },
  {
    id: "salesPlanGateProductSearch",
    dimension: "routing",
    applies: (expect) => expect.salesPlanGateProductSearch != null,
    run: (out, expect) =>
      Boolean(out.salesPlan?.gateProductSearch) === Boolean(expect.salesPlanGateProductSearch)
        ? null
        : `salesPlan gate expected ${expect.salesPlanGateProductSearch}, got ${out.salesPlan?.gateProductSearch ?? "?"}`,
  },
];

export function evaluateCase(out, expect = {}, criteria = DEFAULT_CRITERIA) {
  const failures = [];
  const checks = [];
  const dimensions = Object.fromEntries(
    (criteria.dimensions ?? DEFAULT_CRITERIA.dimensions).map((d) => [
      d.id,
      { ...d, applicable: 0, passed: 0, failures: [] },
    ])
  );

  for (const check of CHECKS) {
    if (!check.applies(expect)) continue;
    const failure = check.run(out, expect);
    const passed = !failure;
    checks.push({ id: check.id, dimension: check.dimension, passed, failure });
    const dim = dimensions[check.dimension] ?? (dimensions[check.dimension] = {
      id: check.dimension,
      label: check.dimension,
      weight: 1,
      applicable: 0,
      passed: 0,
      failures: [],
    });
    dim.applicable += 1;
    if (passed) {
      dim.passed += 1;
    } else {
      failures.push(failure);
      dim.failures.push(failure);
    }
  }

  let possible = 0;
  let earned = 0;
  for (const dim of Object.values(dimensions)) {
    if (!dim.applicable) continue;
    possible += dim.weight;
    earned += dim.weight * (dim.passed / dim.applicable);
  }

  const score = possible ? Math.round((earned / possible) * 100) : failures.length ? 0 : 100;
  return { passed: failures.length === 0, failures, checks, dimensions, score };
}

/**
 * @param {Record<string, unknown>} out - chat response fields
 * @param {Record<string, unknown>} expect - case.expect from cases.json
 * @returns {string[]} failure messages (empty = pass)
 */
export function assertCase(out, expect) {
  return evaluateCase(out, expect).failures;
}
