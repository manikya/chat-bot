import type { AgentTurnState } from "./agent-state";

export interface ResponseQualityResult {
  reply: string;
  flags: string[];
}

function normalizeQuestion(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function questions(reply: string): string[] {
  return reply.match(/[^.!?]*\?/g)?.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean) ?? [];
}

function removeRepeatedQuestions(reply: string, recentQuestions: string[]): { reply: string; removed: boolean } {
  let next = reply;
  let removed = false;
  const recent = new Set(recentQuestions.map(normalizeQuestion).filter(Boolean));
  for (const question of questions(reply)) {
    const key = normalizeQuestion(question);
    if (!key || !recent.has(key)) continue;
    next = next.replace(question, "").replace(/\s{2,}/g, " ").trim();
    removed = true;
  }
  return { reply: next, removed };
}

function hasLanguageMismatch(reply: string, replyLanguage?: AgentTurnState["replyLanguage"]): boolean {
  if (!replyLanguage || replyLanguage === "unknown" || replyLanguage === "mixed") return false;
  const hasSinhala = /[\u0D80-\u0DFF]/u.test(reply);
  const hasTamil = /[\u0B80-\u0BFF]/u.test(reply);
  if (replyLanguage === "english") return hasSinhala || hasTamil;
  if (replyLanguage === "sinhala") return hasTamil;
  if (replyLanguage === "tamil") return hasSinhala;
  return false;
}

function repairArtifacts(reply: string): { reply: string; flags: string[] } {
  const flags: string[] = [];
  let next = reply
    .replace(/\bundefined\b|\bnull\b/gi, "")
    .replace(/```(?:json)?[\s\S]*?```/gi, "")
    .replace(/\btool_call(?:s)?\b[:\s\S]*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (next !== reply.trim()) flags.push("repaired_artifacts");

  if (/\b(?:it's|it is)\s+priced\.?$/i.test(next) || /\b(?:with|and|or|a|the|for|to)\.?$/i.test(next)) {
    next = next.replace(/\b(?:it's|it is)\s+priced\.?$/i, "It is available in the product cards below.").trim();
    next = next.replace(/\b(?:with|and|or|a|the|for|to)\.?$/i, "").trim();
    flags.push("repaired_unfinished_sentence");
  }

  return { reply: next, flags };
}

export function validateResponseQuality(input: {
  reply: string;
  state: AgentTurnState;
  fallbackReply?: string;
}): ResponseQualityResult {
  const flags: string[] = [];
  let reply = input.reply.trim();

  const artifactRepair = repairArtifacts(reply);
  reply = artifactRepair.reply;
  flags.push(...artifactRepair.flags);

  const repeated = removeRepeatedQuestions(reply, input.state.memory.recentAssistantQuestions);
  reply = repeated.reply || reply;
  if (repeated.removed) flags.push("removed_repeated_question");

  if (hasLanguageMismatch(reply, input.state.replyLanguage)) {
    flags.push("language_mismatch");
  }

  if (!reply || reply.length < 3) {
    reply = input.fallbackReply ?? "I found a few options that may help.";
    flags.push("used_quality_fallback");
  }

  return { reply, flags };
}
