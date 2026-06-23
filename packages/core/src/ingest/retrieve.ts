import type { AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { createEmbeddingProvider } from "./embedding";
import type { ScoredChunk } from "./types";
import { createVectorStore } from "./vectors";

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "and",
  "or",
  "do",
  "you",
  "have",
  "has",
  "is",
  "are",
  "it",
  "its",
  "i",
  "me",
  "my",
  "we",
  "our",
  "with",
  "what",
  "how",
  "show",
]);

function searchTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length >= 2 && !STOP_WORDS.has(term))
    ),
  ];
}

function metadataText(hit: ScoredChunk): string {
  const metadata = hit.chunk.metadata;
  return [
    metadata.title,
    metadata.section,
    metadata.sku,
    metadata.categories?.join(" "),
    metadata.tags?.join(" "),
    metadata.material?.join(" "),
    metadata.occasion?.join(" "),
    metadata.recipient?.join(" "),
    metadata.compatibility?.join(" "),
    metadata.bundles?.join(" "),
    metadata.question,
    hit.chunk.text,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function lexicalScore(hit: ScoredChunk, terms: string[]): number {
  if (!terms.length) return 0;
  const haystack = metadataText(hit);
  const matches = terms.filter((term) => haystack.includes(term)).length;
  return matches / terms.length;
}

function rerankHybrid(query: string, hits: ScoredChunk[], limit: number): ScoredChunk[] {
  const terms = searchTerms(query);
  return hits
    .map((hit) => {
      const keywordBoost = lexicalScore(hit, terms) * 0.2;
      return { ...hit, score: hit.score + keywordBoost };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function retrieveKnowledge(
  auth: AuthContext,
  query: string,
  config: CoreConfig,
  options?: { topK?: number; sourceType?: string }
): Promise<ScoredChunk[]> {
  try {
    const embedder = createEmbeddingProvider(config);
    const [embedding] = await embedder.embed([query]);
    const store = createVectorStore(config);
    const topK = options?.topK ?? 5;
    const recallK = Math.min(Math.max(topK * 3, topK), 30);
    const hits = await store.query(auth.tenantId, embedding!, {
      topK: recallK,
      sourceType: options?.sourceType,
    });
    return rerankHybrid(query, hits, topK);
  } catch (err) {
    console.warn(
      "[retrieve] vector search unavailable; continuing without RAG context",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}
