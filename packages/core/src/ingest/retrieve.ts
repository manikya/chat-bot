import type { AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { createEmbeddingProvider } from "./embedding";
import type { ScoredChunk } from "./types";
import { createVectorStore } from "./vectors";

export async function retrieveKnowledge(
  auth: AuthContext,
  query: string,
  config: CoreConfig,
  options?: { topK?: number; sourceType?: string }
): Promise<ScoredChunk[]> {
  const embedder = createEmbeddingProvider(config);
  const [embedding] = await embedder.embed([query]);
  const store = createVectorStore(config);
  return store.query(auth.tenantId, embedding!, {
    topK: options?.topK ?? 5,
    sourceType: options?.sourceType,
  });
}
