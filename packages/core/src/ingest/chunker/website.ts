import { generateId } from "@commercechat/shared";
import type { ChunkMetadata, VectorChunk } from "../types";
import type { HtmlSection } from "../parsers/html";

const MAX_CHARS = 3200; // ~800 tokens
const OVERLAP_CHARS = 400; // ~100 tokens

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitLongText(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + MAX_CHARS, text.length);
    parts.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = end - OVERLAP_CHARS;
  }
  return parts.filter(Boolean);
}

export function chunkWebsiteSections(
  sourceId: string,
  pageUrl: string,
  pageTitle: string,
  sections: HtmlSection[],
  crawledAt: string
): Array<{ text: string; metadata: ChunkMetadata }> {
  const chunks: Array<{ text: string; metadata: ChunkMetadata }> = [];

  for (const section of sections) {
    const pieces = splitLongText(section.text);
    for (const piece of pieces) {
      const text = `${section.title}\n\n${piece}`.trim();
      chunks.push({
        text,
        metadata: {
          source_type: "website",
          url: pageUrl,
          title: pageTitle,
          section: section.title,
          crawled_at: crawledAt,
        },
      });
    }
  }
  return chunks;
}

export function toVectorChunks(
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

export function countTokens(texts: string[]): number {
  return texts.reduce((sum, t) => sum + estimateTokens(t), 0);
}
