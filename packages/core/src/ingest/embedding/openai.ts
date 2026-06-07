import { EMBEDDING_DIMENSIONS } from "../types";
import type { EmbeddingProvider } from "./provider";

const BATCH_SIZE = 100;
const MAX_RETRIES = 3;

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = EMBEDDING_DIMENSIONS;

  constructor(
    private apiKey: string,
    private model = "text-embedding-3-small"
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      results.push(...(await this.embedBatch(batch)));
    }
    return results;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            input: texts,
            dimensions: EMBEDDING_DIMENSIONS,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`OpenAI embeddings failed (${res.status}): ${body}`);
        }
        const json = (await res.json()) as {
          data: Array<{ embedding: number[]; index: number }>;
        };
        const ordered = json.data.sort((a, b) => a.index - b.index);
        return ordered.map((d) => d.embedding);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        }
      }
    }
    throw lastError ?? new Error("OpenAI embeddings failed");
  }
}
