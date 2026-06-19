/**
 * @param {Record<string, unknown>} out - chat response fields
 * @param {Record<string, unknown>} expect - case.expect from cases.json
 * @returns {string[]} failure messages (empty = pass)
 */
export function assertCase(out, expect) {
  const failures = [];

  if (expect.nonEmptyReply && !String(out.reply || "").trim()) {
    failures.push("empty reply");
  }

  if (expect.intent && out.intent !== expect.intent) {
    failures.push(`intent expected ${expect.intent}, got ${out.intent ?? "?"}`);
  }

  if (expect.subIntent && out.subIntent !== expect.subIntent) {
    failures.push(`subIntent expected ${expect.subIntent}, got ${out.subIntent ?? "?"}`);
  }

  if (expect.funnelStage) {
    const allowed = Array.isArray(expect.funnelStage) ? expect.funnelStage : [expect.funnelStage];
    if (!allowed.includes(out.funnelStage)) {
      failures.push(`funnelStage expected one of ${allowed.join("|")}, got ${out.funnelStage ?? "?"}`);
    }
  }

  if (expect.toolsIncludes) {
    const tools = String(out.tools || "");
    for (const t of expect.toolsIncludes) {
      if (!tools.includes(t)) failures.push(`missing tool ${t}`);
    }
  }

  if (expect.replyMinLength && String(out.reply || "").length < expect.replyMinLength) {
    failures.push(`reply shorter than ${expect.replyMinLength}`);
  }

  if (expect.replyIncludes) {
    const reply = String(out.reply || "").toLowerCase();
    for (const text of expect.replyIncludes) {
      if (!reply.includes(String(text).toLowerCase())) {
        failures.push(`reply missing "${text}"`);
      }
    }
  }

  if (expect.replyExcludes) {
    const reply = String(out.reply || "").toLowerCase();
    for (const text of expect.replyExcludes) {
      if (reply.includes(String(text).toLowerCase())) {
        failures.push(`reply should not include "${text}"`);
      }
    }
  }

  if (expect.maxProductCards != null && Number(out.productCards || 0) > expect.maxProductCards) {
    failures.push(`productCards expected <= ${expect.maxProductCards}, got ${out.productCards ?? 0}`);
  }

  if (expect.minSuggestedActions != null && Number(out.suggestedActions || 0) < expect.minSuggestedActions) {
    failures.push(`suggestedActions expected >= ${expect.minSuggestedActions}, got ${out.suggestedActions ?? 0}`);
  }

  return failures;
}
