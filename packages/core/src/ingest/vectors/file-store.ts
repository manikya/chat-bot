import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import type { ScoredChunk, VectorChunk } from "../types";
import type { VectorQueryOptions, VectorStore } from "./store";

interface TenantIndex {
  chunks: VectorChunk[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class FileVectorStore implements VectorStore {
  constructor(private dataDir: string) {}

  private filePath(tenantId: string) {
    return join(this.dataDir, "vectors", `${tenantId}.json`);
  }

  private async load(tenantId: string): Promise<TenantIndex> {
    try {
      const raw = await readFile(this.filePath(tenantId), "utf8");
      return JSON.parse(raw) as TenantIndex;
    } catch {
      return { chunks: [] };
    }
  }

  private async save(tenantId: string, index: TenantIndex) {
    const path = this.filePath(tenantId);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(index, null, 2), "utf8");
  }

  async upsert(tenantId: string, chunks: VectorChunk[]): Promise<void> {
    const index = await this.load(tenantId);
    const byId = new Map(index.chunks.map((c) => [c.id, c]));
    for (const chunk of chunks) {
      byId.set(chunk.id, chunk);
    }
    index.chunks = [...byId.values()];
    await this.save(tenantId, index);
  }

  async deleteBySource(tenantId: string, sourceId: string): Promise<void> {
    const index = await this.load(tenantId);
    index.chunks = index.chunks.filter((c) => c.sourceId !== sourceId);
    await this.save(tenantId, index);
  }

  async query(
    tenantId: string,
    embedding: number[],
    options?: VectorQueryOptions
  ): Promise<ScoredChunk[]> {
    const index = await this.load(tenantId);
    let candidates = index.chunks;
    if (options?.sourceId) {
      candidates = candidates.filter((c) => c.sourceId === options.sourceId);
    }
    if (options?.sourceType) {
      candidates = candidates.filter((c) => c.metadata.source_type === options.sourceType);
    }
    const topK = options?.topK ?? 10;
    return candidates
      .map((chunk) => ({ chunk, score: cosineSimilarity(embedding, chunk.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async countByTenant(tenantId: string): Promise<number> {
    const index = await this.load(tenantId);
    return index.chunks.length;
  }
}
