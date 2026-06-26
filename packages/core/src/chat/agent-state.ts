import type { ChatIntent, ChatSubIntent, FunnelStage, QualificationState } from "@commercechat/shared";
import type { StoredMessage } from "./conversation";
import type { SalesPlan } from "./sales-planner";

export interface AgentMemory {
  recentProductSkus: string[];
  recentAssistantQuestions: string[];
  recentSuggestedActionLabels: string[];
  recentSuggestedActionMessages: string[];
}

export interface AgentTurnState {
  latestMessage: string;
  intent: ChatIntent;
  subIntent: ChatSubIntent;
  funnelStage: FunnelStage;
  qualification: QualificationState;
  planner: SalesPlan | null;
  userMove?: SalesPlan["userMove"];
  replyLanguage?: SalesPlan["replyLanguage"] | SalesPlan["languageStyle"];
  resetContext: boolean;
  memory: AgentMemory;
}

function unique(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.slice(-max);
}

function metadataStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function extractQuestions(content: string): string[] {
  const questions = content.match(/[^.!?]*\?/g) ?? [];
  return questions.map((question) => question.replace(/\s+/g, " ").trim()).filter(Boolean);
}

export function buildAgentMemory(history: StoredMessage[]): AgentMemory {
  const recent = history.slice(-8);
  return {
    recentProductSkus: unique(
      recent.flatMap((item) => metadataStringList(item.metadata?.surfacedProductSkus)),
      30
    ),
    recentAssistantQuestions: unique(
      recent
        .filter((item) => item.role === "assistant")
        .flatMap((item) => extractQuestions(item.content)),
      8
    ),
    recentSuggestedActionLabels: unique(
      recent.flatMap((item) => metadataStringList(item.metadata?.suggestedActionLabels)),
      12
    ),
    recentSuggestedActionMessages: unique(
      recent.flatMap((item) => metadataStringList(item.metadata?.suggestedActionMessages)),
      12
    ),
  };
}

export function buildAgentTurnState(input: {
  latestMessage: string;
  intent: ChatIntent;
  subIntent: ChatSubIntent;
  funnelStage: FunnelStage;
  qualification: QualificationState;
  planner: SalesPlan | null;
  history: StoredMessage[];
  resetContext: boolean;
}): AgentTurnState {
  const memory = buildAgentMemory(input.history);
  return {
    latestMessage: input.latestMessage,
    intent: input.intent,
    subIntent: input.subIntent,
    funnelStage: input.funnelStage,
    qualification: input.qualification,
    planner: input.planner,
    userMove: input.planner?.userMove,
    replyLanguage: input.planner?.replyLanguage ?? input.planner?.languageStyle,
    resetContext: input.resetContext,
    memory,
  };
}
