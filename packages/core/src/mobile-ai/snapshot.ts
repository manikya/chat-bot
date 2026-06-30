import { createHash } from "node:crypto";
import { ListVectorsCommand } from "@aws-sdk/client-s3vectors";
import { ApiError, ok, type AuthContext } from "@commercechat/shared";
import type {
  MobileAiSnapshotChunk,
  MobileAiSnapshotDelta,
  MobileAiSnapshotManifest,
  MobileAiSourceType,
} from "@commercechat/shared/types";
import type { CoreConfig } from "../config";
import { EMBEDDING_DIMENSIONS } from "../ingest/types";
import { createS3VectorsClient, tenantIndexName } from "../ingest/vectors/s3-client";

const DEFAULT_MAX_CHUNKS = 1000;
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

const SOURCE_TYPES = new Set<MobileAiSourceType>([
  "catalog",
  "faq",
  "website",
  "page_voice",
  "conversation",
  "policy",
  "unknown",
]);

interface SnapshotExport {
  manifest: MobileAiSnapshotManifest;
  chunks: MobileAiSnapshotChunk[];
}

function splitMetaList(value: unknown): string[] | undefined {
  if (!value) return undefined;
  return String(value)
    .split(/[,|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sourceType(value: unknown): MobileAiSourceType {
  const raw = String(value ?? "unknown");
  return SOURCE_TYPES.has(raw as MobileAiSourceType) ? (raw as MobileAiSourceType) : "unknown";
}

function numberMeta(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function booleanMeta(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
}

function textMeta(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value);
  return text ? text : undefined;
}

function recordMeta(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function chunkUpdatedAt(metadata: Record<string, unknown>, generatedAt: string): string {
  return textMeta(metadata.crawled_at) ?? textMeta(metadata.date) ?? generatedAt;
}

function vectorToChunk(
  vector: { key?: string; data?: { float32?: number[] }; metadata?: unknown },
  version: number,
  generatedAt: string
): MobileAiSnapshotChunk | null {
  const id = vector.key;
  const metadata = recordMeta(vector.metadata);
  const embedding = vector.data?.float32 ?? [];
  const text = textMeta(metadata.text);
  if (!id || !text || !embedding.length) return null;

  return {
    id,
    sourceId: String(metadata.sourceId ?? ""),
    sourceType: sourceType(metadata.source_type),
    text,
    embedding,
    version,
    updatedAt: chunkUpdatedAt(metadata, generatedAt),
    metadata: {
      title: textMeta(metadata.title),
      section: textMeta(metadata.section),
      url: textMeta(metadata.url),
      sku: textMeta(metadata.sku),
      categories: splitMetaList(metadata.categories),
      price: numberMeta(metadata.price),
      currency: textMeta(metadata.currency),
      inStock: booleanMeta(metadata.inStock),
      tags: splitMetaList(metadata.tags),
      material: splitMetaList(metadata.material),
      occasion: splitMetaList(metadata.occasion),
      recipient: splitMetaList(metadata.recipient),
      question: textMeta(metadata.question),
    },
  };
}

function snapshotHash(chunks: Array<Pick<MobileAiSnapshotChunk, "id" | "sourceId" | "updatedAt">>): string {
  const hash = createHash("sha256");
  for (const chunk of [...chunks].sort((a, b) => a.id.localeCompare(b.id))) {
    hash.update(chunk.id);
    hash.update("\0");
    hash.update(chunk.sourceId);
    hash.update("\0");
    hash.update(chunk.updatedAt);
    hash.update("\n");
  }
  return hash.digest("hex");
}

function hashToVersion(checksum: string): number {
  const slice = checksum.slice(0, 12) || "1";
  return Math.max(1, Number.parseInt(slice, 16));
}

function snapshotUrls(config: CoreConfig, version: number) {
  const base = config.apiPublicUrl.replace(/\/$/, "");
  return {
    downloadUrl: `${base}/api/v1/mobile-ai/snapshot/chunks`,
    deltaUrl: `${base}/api/v1/mobile-ai/snapshot/chunks?sinceVersion=${version}`,
  };
}

async function listMobileSnapshotChunks(
  tenantId: string,
  config: CoreConfig,
  options?: { maxChunks?: number }
): Promise<MobileAiSnapshotChunk[]> {
  if (!config.s3VectorsBucketName) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Mobile AI snapshots require S3_VECTORS_BUCKET", 503);
  }

  const client = createS3VectorsClient(config);
  const chunks: MobileAiSnapshotChunk[] = [];
  const generatedAt = new Date().toISOString();
  const maxChunks = Math.min(Math.max(options?.maxChunks ?? DEFAULT_MAX_CHUNKS, 1), DEFAULT_MAX_CHUNKS);
  let nextToken: string | undefined;

  try {
    do {
      const res = await client.send(
        new ListVectorsCommand({
          vectorBucketName: config.s3VectorsBucketName,
          indexName: tenantIndexName(tenantId),
          maxResults: Math.min(500, maxChunks - chunks.length),
          nextToken,
          returnData: true,
          returnMetadata: true,
        })
      );

      for (const vector of res.vectors ?? []) {
        const chunk = vectorToChunk(vector, 1, generatedAt);
        if (chunk) chunks.push(chunk);
        if (chunks.length >= maxChunks) break;
      }

      nextToken = chunks.length >= maxChunks ? undefined : res.nextToken;
    } while (nextToken);
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "NotFoundException" || name === "ResourceNotFoundException") {
      return [];
    }
    throw err;
  }

  const checksum = snapshotHash(chunks);
  const version = hashToVersion(checksum);
  return chunks.map((chunk) => ({ ...chunk, version }));
}

async function exportMobileSnapshot(
  auth: AuthContext,
  config: CoreConfig,
  options?: { maxChunks?: number }
): Promise<SnapshotExport> {
  const generatedAt = new Date().toISOString();
  const chunks = await listMobileSnapshotChunks(auth.tenantId, config, options);
  const checksum = snapshotHash(chunks);
  const version = hashToVersion(checksum);
  const { downloadUrl, deltaUrl } = snapshotUrls(config, version);

  return {
    chunks,
    manifest: {
      tenantId: auth.tenantId,
      snapshotId: `${auth.tenantId}:${version}`,
      version,
      generatedAt,
      expiresAt: new Date(Date.now() + SNAPSHOT_TTL_MS).toISOString(),
      embeddingModel: config.embeddingModel,
      embeddingDimensions: EMBEDDING_DIMENSIONS,
      chunkCount: chunks.length,
      deletedChunkIds: [],
      checksum,
      downloadUrl,
      deltaUrl,
      volatileFields: ["price", "inStock", "availability", "checkoutUrl"],
    },
  };
}

export async function getMobileAiSnapshotManifest(
  auth: AuthContext,
  config: CoreConfig
) {
  const snapshot = await exportMobileSnapshot(auth, config);
  return ok(snapshot.manifest);
}

export async function getMobileAiSnapshotDelta(
  auth: AuthContext,
  config: CoreConfig,
  options?: { sinceVersion?: number; maxChunks?: number }
) {
  const snapshot = await exportMobileSnapshot(auth, config, { maxChunks: options?.maxChunks });
  const currentVersion = snapshot.manifest.version;
  const isCurrent = options?.sinceVersion != null && options.sinceVersion >= currentVersion;
  const delta: MobileAiSnapshotDelta = {
    tenantId: auth.tenantId,
    fromVersion: options?.sinceVersion,
    toVersion: currentVersion,
    generatedAt: snapshot.manifest.generatedAt,
    chunks: isCurrent ? [] : snapshot.chunks,
    deletedChunkIds: [],
  };
  return ok(delta);
}
