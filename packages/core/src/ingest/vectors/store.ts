import type { ScoredChunk, VectorChunk } from "../types";

export interface VectorQueryOptions {
  topK?: number;
  sourceId?: string;
  sourceType?: string;
}

export interface VectorStore {
  upsert(tenantId: string, chunks: VectorChunk[]): Promise<void>;
  deleteBySource(tenantId: string, sourceId: string): Promise<void>;
  query(tenantId: string, embedding: number[], options?: VectorQueryOptions): Promise<ScoredChunk[]>;
  countByTenant(tenantId: string): Promise<number>;
}
