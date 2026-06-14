import {
  CreateIndexCommand,
  DeleteVectorsCommand,
  ListVectorsCommand,
  PutVectorsCommand,
  QueryVectorsCommand,
  type QueryVectorsCommandInput,
} from "@aws-sdk/client-s3vectors";
import type { CoreConfig } from "../../config";
import { EMBEDDING_DIMENSIONS, type ChunkMetadata, type ScoredChunk, type VectorChunk } from "../types";
import { createS3VectorsClient, tenantIndexName } from "./s3-client";
import type { VectorQueryOptions, VectorStore } from "./store";

const PUT_BATCH_SIZE = 500;
const DELETE_BATCH_SIZE = 500;

const ensuredIndexes = new Set<string>();

function chunkToMetadata(chunk: VectorChunk): Record<string, string | number | boolean> {
  const meta: Record<string, string | number | boolean> = {
    sourceId: chunk.sourceId,
    source_type: chunk.metadata.source_type,
    text: chunk.text,
  };
  if (chunk.metadata.title) meta.title = chunk.metadata.title;
  if (chunk.metadata.url) meta.url = chunk.metadata.url;
  if (chunk.metadata.section) meta.section = chunk.metadata.section;
  if (chunk.metadata.sku) meta.sku = chunk.metadata.sku;
  if (chunk.metadata.platform) meta.platform = chunk.metadata.platform;
  if (chunk.metadata.date) meta.date = chunk.metadata.date;
  if (chunk.metadata.question) meta.question = chunk.metadata.question;
  if (chunk.metadata.crawled_at) meta.crawled_at = chunk.metadata.crawled_at;
  return meta;
}

function metadataToChunk(key: string, metadata: Record<string, unknown>): VectorChunk {
  const sourceId = String(metadata.sourceId ?? "");
  const text = String(metadata.text ?? "");
  const sourceType = String(metadata.source_type ?? "unknown");
  const chunkMeta: ChunkMetadata = { source_type: sourceType };
  if (metadata.title) chunkMeta.title = String(metadata.title);
  if (metadata.url) chunkMeta.url = String(metadata.url);
  if (metadata.section) chunkMeta.section = String(metadata.section);
  if (metadata.sku) chunkMeta.sku = String(metadata.sku);
  if (metadata.platform) chunkMeta.platform = String(metadata.platform);
  if (metadata.date) chunkMeta.date = String(metadata.date);
  if (metadata.question) chunkMeta.question = String(metadata.question);
  if (metadata.crawled_at) chunkMeta.crawled_at = String(metadata.crawled_at);

  return {
    id: key,
    sourceId,
    text,
    embedding: [],
    metadata: chunkMeta,
  };
}

function buildFilter(options?: VectorQueryOptions): Record<string, unknown> | undefined {
  const clauses: Record<string, unknown>[] = [];
  if (options?.sourceType) clauses.push({ source_type: options.sourceType });
  if (options?.sourceId) clauses.push({ sourceId: options.sourceId });
  if (!clauses.length) return undefined;
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

function distanceToScore(distance?: number): number {
  if (distance == null || Number.isNaN(distance)) return 0;
  return Math.max(0, 1 - distance);
}

export class S3VectorStore implements VectorStore {
  private client;

  constructor(private config: CoreConfig) {
    if (!config.s3VectorsBucketName) {
      throw new Error("S3_VECTORS_BUCKET is required for vector search");
    }
    this.client = createS3VectorsClient(config);
  }

  private bucket() {
    return this.config.s3VectorsBucketName!;
  }

  private async ensureIndex(tenantId: string): Promise<string> {
    const indexName = tenantIndexName(tenantId);
    const cacheKey = `${this.bucket()}:${indexName}`;
    if (ensuredIndexes.has(cacheKey)) return indexName;

    try {
      await this.client.send(
        new CreateIndexCommand({
          vectorBucketName: this.bucket(),
          indexName,
          dataType: "float32",
          dimension: EMBEDDING_DIMENSIONS,
          distanceMetric: "cosine",
          metadataConfiguration: {
            nonFilterableMetadataKeys: ["text"],
          },
        })
      );
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name !== "ConflictException" && name !== "ServiceUnavailableException") {
        throw err;
      }
    }

    ensuredIndexes.add(cacheKey);
    return indexName;
  }

  async upsert(tenantId: string, chunks: VectorChunk[]): Promise<void> {
    if (!chunks.length) return;
    const indexName = await this.ensureIndex(tenantId);

    for (let i = 0; i < chunks.length; i += PUT_BATCH_SIZE) {
      const batch = chunks.slice(i, i + PUT_BATCH_SIZE);
      await this.client.send(
        new PutVectorsCommand({
          vectorBucketName: this.bucket(),
          indexName,
          vectors: batch.map((chunk) => ({
            key: chunk.id,
            data: { float32: chunk.embedding },
            metadata: chunkToMetadata(chunk),
          })),
        })
      );
    }
  }

  private async listVectorKeys(tenantId: string, sourceId?: string): Promise<string[]> {
    const indexName = await this.ensureIndex(tenantId);
    const keys: string[] = [];
    let nextToken: string | undefined;

    do {
      const res = await this.client.send(
        new ListVectorsCommand({
          vectorBucketName: this.bucket(),
          indexName,
          nextToken,
          returnMetadata: Boolean(sourceId),
          maxResults: 500,
        })
      );

      for (const vector of res.vectors ?? []) {
        if (!vector.key) continue;
        if (sourceId) {
          const meta = (vector.metadata ?? {}) as Record<string, unknown>;
          if (String(meta.sourceId ?? "") !== sourceId) continue;
        }
        keys.push(vector.key);
      }

      nextToken = res.nextToken;
    } while (nextToken);

    return keys;
  }

  async deleteBySource(tenantId: string, sourceId: string): Promise<void> {
    const indexName = await this.ensureIndex(tenantId);
    const keys = await this.listVectorKeys(tenantId, sourceId);
    if (!keys.length) return;

    for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
      const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
      await this.client.send(
        new DeleteVectorsCommand({
          vectorBucketName: this.bucket(),
          indexName,
          keys: batch,
        })
      );
    }
  }

  async query(
    tenantId: string,
    embedding: number[],
    options?: VectorQueryOptions
  ): Promise<ScoredChunk[]> {
    const indexName = await this.ensureIndex(tenantId);
    const filter = buildFilter(options);

    const res = await this.client.send(
      new QueryVectorsCommand({
        vectorBucketName: this.bucket(),
        indexName,
        topK: options?.topK ?? 10,
        queryVector: { float32: embedding },
        ...(filter ? { filter: filter as QueryVectorsCommandInput["filter"] } : {}),
        returnMetadata: true,
        returnDistance: true,
      })
    );

    return (res.vectors ?? []).map((hit) => {
      const metadata = (hit.metadata ?? {}) as Record<string, unknown>;
      return {
        chunk: metadataToChunk(hit.key ?? "", metadata),
        score: distanceToScore(hit.distance),
      };
    });
  }

  async countByTenant(tenantId: string): Promise<number> {
    const keys = await this.listVectorKeys(tenantId);
    return keys.length;
  }
}
