import type { ScoredChunk } from "../ingest/types";

const OBJECTION_TAG_PREFIX = "objection:";

function chunkTags(chunk: ScoredChunk): string[] {
  const raw = (chunk.chunk.metadata as { tags?: string[] | string }).tags;
  if (Array.isArray(raw)) return raw.map((t) => t.toLowerCase());
  if (typeof raw === "string") return [raw.toLowerCase()];
  return [];
}

export function boostObjectionFaqChunks(
  chunks: ScoredChunk[],
  objectionTypes: string[]
): ScoredChunk[] {
  const types =
    objectionTypes.length > 0
      ? objectionTypes.map((t) => t.toLowerCase())
      : ["price", "shipping", "returns", "trust", "general"];

  return chunks
    .map((hit) => {
      if (hit.chunk.metadata.source_type !== "faq") return hit;
      const tags = chunkTags(hit);
      const matches = tags.some((tag) => {
        if (!tag.startsWith(OBJECTION_TAG_PREFIX) && !tag.includes("objection")) return false;
        return types.some((t) => tag.includes(t));
      });
      if (!matches) return hit;
      return { ...hit, score: hit.score + 0.2 };
    })
    .sort((a, b) => b.score - a.score);
}
