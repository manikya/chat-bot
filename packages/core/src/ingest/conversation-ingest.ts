import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import type { ConversationPair } from "../page-voice/types";
import {
  chunkConversationPairs,
  toConversationVectorChunks,
} from "./chunker/conversation";
import { createEmbeddingProvider } from "./embedding";
import { createVectorStore } from "./vectors";

async function loadConversationPairs(
  tenantId: string,
  config: CoreConfig
): Promise<ConversationPair[]> {
  const db = getDocClient(config);
  const pairs: ConversationPair[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const res = await db.send(
      new QueryCommand({
        TableName: config.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": Keys.tenantPk(tenantId),
          ":sk": "PAGE_VOICE#PAIR#",
        },
        ExclusiveStartKey: lastKey,
      })
    );
    for (const item of res.Items ?? []) {
      pairs.push({
        pairId: item.pairId as string,
        customerText: item.customerText as string,
        ownerText: item.ownerText as string,
        platform: item.platform as ConversationPair["platform"],
        capturedAt: item.capturedAt as string,
        customerMessageId: item.customerMessageId as string | undefined,
        ownerMessageId: item.ownerMessageId as string | undefined,
        threadPsid: item.threadPsid as string | undefined,
      });
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  return pairs.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export async function embedConversationPairs(
  tenantId: string,
  sourceId: string,
  config: CoreConfig
) {
  const pairs = await loadConversationPairs(tenantId, config);
  if (!pairs.length) throw new Error("No conversation pairs to embed");

  const vectorStore = createVectorStore(config);
  await vectorStore.deleteBySource(tenantId, sourceId);

  const syncedAt = new Date().toISOString();
  const drafts = chunkConversationPairs(sourceId, pairs, syncedAt);
  const embedder = createEmbeddingProvider(config);
  const embeddings = await embedder.embed(drafts.map((d) => d.text));
  const vectorChunks = toConversationVectorChunks(sourceId, drafts, embeddings);
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
        ":cfg": { pairCount: pairs.length, lastIngestAt: syncedAt, platform: "messenger" },
      },
    })
  );

  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.pageVoiceMeta() },
      UpdateExpression: "SET #vectorCount = :v, #lastSyncAt = :l, #updatedAt = :u",
      ExpressionAttributeNames: {
        "#vectorCount": "vectorCount",
        "#lastSyncAt": "lastSyncAt",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":v": vectorChunks.length,
        ":l": syncedAt,
        ":u": syncedAt,
      },
    })
  );

  return { pairCount: pairs.length, chunkCount: vectorChunks.length };
}

export async function runConversationIngestForSource(
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
  if (!source.Item || source.Item.type !== "conversation") {
    throw new Error("Conversation source not found");
  }
  return embedConversationPairs(tenantId, sourceId, config);
}
