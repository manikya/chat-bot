import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { chunkFaqItems, toFaqVectorChunks, type FaqItem } from "./chunker/faq";
import { createEmbeddingProvider } from "./embedding";
import { createVectorStore } from "./vectors";

export async function embedFaqItems(
  tenantId: string,
  sourceId: string,
  items: FaqItem[],
  config: CoreConfig
) {
  const vectorStore = createVectorStore(config);
  await vectorStore.deleteBySource(tenantId, sourceId);

  const syncedAt = new Date().toISOString();
  const drafts = chunkFaqItems(sourceId, items, syncedAt);
  const embedder = createEmbeddingProvider(config);
  const embeddings = await embedder.embed(drafts.map((d) => d.text));
  const vectorChunks = toFaqVectorChunks(sourceId, drafts, embeddings);
  await vectorStore.upsert(tenantId, vectorChunks);

  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.source(sourceId) },
      UpdateExpression:
        "SET #status = :s, #lastSyncAt = :l, #chunkCount = :c, #vectorCount = :v, #updatedAt = :u, #config = :cfg",
      ExpressionAttributeNames: {
        "#status": "status",
        "#lastSyncAt": "lastSyncAt",
        "#chunkCount": "chunkCount",
        "#vectorCount": "vectorCount",
        "#updatedAt": "updatedAt",
        "#config": "config",
      },
      ExpressionAttributeValues: {
        ":s": "active",
        ":l": syncedAt,
        ":c": vectorChunks.length,
        ":v": vectorChunks.length,
        ":u": syncedAt,
        ":cfg": { items, itemCount: items.length, lastIngestAt: syncedAt },
      },
    })
  );

  return { itemCount: items.length, chunkCount: vectorChunks.length };
}

export async function runFaqIngestForSource(
  tenantId: string,
  sourceId: string,
  config: CoreConfig
) {
  const db = getDocClient(config);
  const source = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.source(sourceId) },
    })
  );
  if (!source.Item || source.Item.type !== "faq") {
    throw new Error("FAQ source not found");
  }
  const cfg = (source.Item.config as { items?: FaqItem[] }) ?? {};
  const items = cfg.items ?? [];
  if (!items.length) throw new Error("FAQ source has no items");
  return embedFaqItems(tenantId, sourceId, items, config);
}
