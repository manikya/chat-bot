export const EMBEDDING_DIMENSIONS = 1024;

export interface ChunkMetadata {
  source_type: string;
  url?: string;
  title?: string;
  section?: string;
  crawled_at?: string;
  sku?: string;
  question?: string;
  platform?: string;
  date?: string;
}

export interface VectorChunk {
  id: string;
  sourceId: string;
  text: string;
  embedding: number[];
  metadata: ChunkMetadata;
}

export interface CrawledPage {
  url: string;
  title: string;
  html: string;
}

export interface IngestJobStats {
  pagesProcessed?: number;
  chunksCreated?: number;
  tokensEmbedded?: number;
  durationSec?: number;
  errors?: string[];
}

export interface ScoredChunk {
  chunk: VectorChunk;
  score: number;
}
