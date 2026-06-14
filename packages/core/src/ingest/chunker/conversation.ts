import { generateId } from "@commercechat/shared";
import type { ConversationPair } from "../../page-voice/types";
import { scrubPii } from "../../page-voice/pii";
import type { ChunkMetadata, VectorChunk } from "../types";

export function chunkConversationPairs(
  sourceId: string,
  pairs: ConversationPair[],
  syncedAt: string
): Array<{ text: string; metadata: ChunkMetadata }> {
  return pairs.map((pair) => {
    const customer = scrubPii(pair.customerText.trim());
    const owner = scrubPii(pair.ownerText.trim());
    return {
      text: `Customer: ${customer}\nOwner: ${owner}`,
      metadata: {
        source_type: "conversation",
        title: customer.slice(0, 80),
        crawled_at: syncedAt,
        platform: pair.platform,
        date: pair.capturedAt.slice(0, 10),
      },
    };
  });
}

export function toConversationVectorChunks(
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
