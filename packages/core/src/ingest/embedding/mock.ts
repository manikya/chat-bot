import { EMBEDDING_DIMENSIONS } from "../types";
import type { EmbeddingProvider } from "./provider";

function mockVector(text: string): number[] {
  const vec = new Array(EMBEDDING_DIMENSIONS).fill(0);
  for (let i = 0; i < text.length; i++) {
    const idx = (text.charCodeAt(i) + i * 31) % EMBEDDING_DIMENSIONS;
    vec[idx] += (text.charCodeAt(i) % 97) / 97;
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(mockVector);
  }
}
