import { generateId } from "@commercechat/shared";
import type { ChunkMetadata, VectorChunk } from "../types";

export interface FaqItem {
  question: string;
  answer: string;
}

export function chunkFaqItems(
  sourceId: string,
  items: FaqItem[],
  syncedAt: string
): Array<{ text: string; metadata: ChunkMetadata }> {
  return items.map((item) => ({
    text: `Q: ${item.question.trim()}\nA: ${item.answer.trim()}`,
    metadata: {
      source_type: "faq",
      question: item.question.trim(),
      title: item.question.trim(),
      crawled_at: syncedAt,
    },
  }));
}

export function toFaqVectorChunks(
  sourceId: string,
  drafts: Array<{ text: string; metadata: ChunkMetadata }>,
  embeddings: number[][]
): VectorChunk[] {
  return drafts.map((draft, i) => ({
    id: generateId("chk_"),
    sourceId,
    text: draft.text,
    embedding: embeddings[i]!,
    metadata: draft.metadata,
  }));
}
