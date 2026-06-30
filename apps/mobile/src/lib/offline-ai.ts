import type {
  MobileAiLocalReply,
  MobileAiSnapshotChunk,
  MobileAiSnapshotManifest,
  MobileAiSyncState,
} from "@commercechat/shared/types";

export type MobileAiRoute = "local" | "cloud" | "local_then_verify";

export interface MobileAiRouteDecision {
  route: MobileAiRoute;
  reason: string;
}

export interface LocalRetrievalHit {
  chunk: MobileAiSnapshotChunk;
  score: number;
}

const CLOUD_REQUIRED_PATTERNS = [
  /\b(checkout|cart|buy|pay|payment|invoice)\b/i,
  /\b(order|tracking|refund|return|cancel)\b/i,
  /\b(available now|in stock|stock|price|discount)\b/i,
  /\b(account|login|password|subscription|billing)\b/i,
  /\b(complaint|angry|bad service|human|agent)\b/i,
];

export const EMPTY_MOBILE_AI_SYNC_STATE: MobileAiSyncState = {
  status: "not_synced",
};

export function snapshotIsFresh(state: MobileAiSyncState, now = Date.now()): boolean {
  if (state.status !== "ready" || !state.expiresAt) return false;
  return Date.parse(state.expiresAt) > now;
}

export function manifestToSyncState(manifest: MobileAiSnapshotManifest): MobileAiSyncState {
  return {
    status: "ready",
    tenantId: manifest.tenantId,
    snapshotId: manifest.snapshotId,
    version: manifest.version,
    chunkCount: manifest.chunkCount,
    lastSyncedAt: new Date().toISOString(),
    expiresAt: manifest.expiresAt,
  };
}

export function decideMobileAiRoute(message: string, state: MobileAiSyncState): MobileAiRouteDecision {
  if (!snapshotIsFresh(state)) {
    return { route: "cloud", reason: "local snapshot unavailable or stale" };
  }

  if (CLOUD_REQUIRED_PATTERNS.some((pattern) => pattern.test(message))) {
    return { route: "local_then_verify", reason: "message may need live commerce or account data" };
  }

  return { route: "local", reason: "fresh snapshot and low-risk message" };
}

export function buildUnavailableLocalReply(reason: string): MobileAiLocalReply {
  return {
    reply: "",
    confidence: 0,
    needsCloud: true,
    usedChunkIds: [],
    riskFlags: [reason],
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    aMag += a[i]! * a[i]!;
    bMag += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(aMag) * Math.sqrt(bMag);
  return denom ? dot / denom : 0;
}

export function rankLocalChunks(
  queryEmbedding: number[],
  chunks: MobileAiSnapshotChunk[],
  topK = 5
): LocalRetrievalHit[] {
  return chunks
    .filter((chunk) => !chunk.deleted && chunk.embedding.length === queryEmbedding.length)
    .map((chunk) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
