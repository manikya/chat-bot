import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  ApiError,
  ErrorCodes,
  generateId,
  ok,
  type AuthContext,
} from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import type { MessengerInboundMessage } from "../channels/types";
import { createQueuedJob, hasActiveJobForSource } from "../ingest/jobs";
import { runConversationIngestJob } from "../ingest/orchestrator";
import { getTenantLimits, getTenantConfig } from "../tenant/service";
import { parseConversationFile, type ParsedConversationPair } from "./parser";
import { scrubPii } from "./pii";
import type { ConversationPair, PageVoiceMeta, PendingCustomerMessage } from "./types";

const PREVIEW_LIMIT = 5;
const MAX_PAIRS = 5000;
const EXPORT_LIMIT = 5000;

async function assertConversationIngestEnabled(auth: AuthContext, config: CoreConfig) {
  const tenantConfig = await getTenantConfig(auth, config);
  if (!tenantConfig.data?.featureFlags?.conversationIngest) {
    throw new ApiError(
      ErrorCodes.FORBIDDEN,
      "Conversation ingest requires a Pro plan or higher. Upgrade in Billing.",
      403
    );
  }
}

function defaultMeta(): PageVoiceMeta {
  const now = new Date().toISOString();
  return {
    learningPaused: false,
    pairCount: 0,
    vectorCount: 0,
    platform: "messenger",
    updatedAt: now,
  };
}

export async function getPageVoiceMeta(
  tenantId: string,
  config: CoreConfig
): Promise<PageVoiceMeta> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.pageVoiceMeta() },
    })
  );
  if (!res.Item) return defaultMeta();
  const { PK: _pk, SK: _sk, ...meta } = res.Item;
  return meta as PageVoiceMeta;
}

async function savePageVoiceMeta(
  tenantId: string,
  patch: Partial<PageVoiceMeta>,
  config: CoreConfig
): Promise<PageVoiceMeta> {
  const existing = await getPageVoiceMeta(tenantId, config);
  const merged: PageVoiceMeta = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const db = getDocClient(config);
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.pageVoiceMeta(),
        ...merged,
      },
    })
  );
  return merged;
}

export async function ensureConversationSource(
  tenantId: string,
  config: CoreConfig
): Promise<string> {
  const meta = await getPageVoiceMeta(tenantId, config);
  if (meta.sourceId) return meta.sourceId;

  const db = getDocClient(config);
  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": "SOURCE#",
      },
    })
  );
  const existing = (res.Items ?? []).find(
    (i) => i.type === "conversation" && i.status !== "deleted"
  );
  if (existing?.sourceId) {
    await savePageVoiceMeta(tenantId, { sourceId: existing.sourceId as string }, config);
    return existing.sourceId as string;
  }

  const auth = { tenantId } as AuthContext;
  const limits = await getTenantLimits(auth, config);
  const sourceCount = (res.Items ?? []).filter((i) => i.status !== "deleted").length;
  if (sourceCount >= limits.data!.maxSources) {
    throw new ApiError(ErrorCodes.PLAN_LIMIT_EXCEEDED, "Knowledge source limit reached", 403);
  }

  const sourceId = generateId("src_");
  const now = new Date().toISOString();
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.source(sourceId),
        sourceId,
        tenantId,
        type: "conversation",
        name: "Page voice",
        config: { pairCount: 0, platform: "messenger" },
        status: "active",
        chunkCount: 0,
        vectorCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    })
  );
  await savePageVoiceMeta(tenantId, { sourceId }, config);
  return sourceId;
}

export async function setPendingCustomerMessage(
  tenantId: string,
  threadPsid: string,
  customerText: string,
  messageId: string,
  config: CoreConfig
) {
  const meta = await getPageVoiceMeta(tenantId, config);
  if (meta.learningPaused) return;

  const pending: PendingCustomerMessage = {
    customerText: customerText.trim(),
    messageId,
    capturedAt: new Date().toISOString(),
  };
  const db = getDocClient(config);
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.pageVoicePending(threadPsid),
        ...pending,
        threadPsid,
      },
    })
  );
}

async function readPendingCustomer(
  tenantId: string,
  threadPsid: string,
  config: CoreConfig
): Promise<PendingCustomerMessage | null> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.pageVoicePending(threadPsid) },
    })
  );
  if (!res.Item) return null;
  return {
    customerText: res.Item.customerText as string,
    messageId: res.Item.messageId as string,
    capturedAt: res.Item.capturedAt as string,
  };
}

async function clearPendingCustomer(
  tenantId: string,
  threadPsid: string,
  config: CoreConfig
) {
  const db = getDocClient(config);
  await db.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.pageVoicePending(threadPsid) },
    })
  );
}

export async function appendConversationPairs(
  tenantId: string,
  pairs: ParsedConversationPair[],
  platform: ConversationPair["platform"],
  config: CoreConfig,
  options?: { customerMessageId?: string; ownerMessageId?: string; threadPsid?: string }
): Promise<{ pairCount: number; added: number }> {
  const meta = await getPageVoiceMeta(tenantId, config);
  if (meta.pairCount + pairs.length > MAX_PAIRS) {
    throw new ApiError(
      ErrorCodes.PLAN_LIMIT_EXCEEDED,
      `Maximum ${MAX_PAIRS} conversation pairs per tenant`,
      403
    );
  }

  await ensureConversationSource(tenantId, config);
  const db = getDocClient(config);
  const now = new Date().toISOString();

  for (const pair of pairs) {
    const pairId = generateId("pv_");
    const item: ConversationPair = {
      pairId,
      customerText: scrubPii(pair.customerText.trim()),
      ownerText: scrubPii(pair.ownerText.trim()),
      platform,
      capturedAt: now,
      customerMessageId: options?.customerMessageId,
      ownerMessageId: options?.ownerMessageId,
      threadPsid: options?.threadPsid,
    };
    await db.send(
      new PutCommand({
        TableName: config.tableName,
        Item: {
          PK: Keys.tenantPk(tenantId),
          SK: Keys.pageVoicePair(now, pairId),
          ...item,
        },
      })
    );
  }

  const pairCount = meta.pairCount + pairs.length;
  await savePageVoiceMeta(tenantId, { pairCount, lastCaptureAt: now }, config);
  return { pairCount, added: pairs.length };
}

async function runConversationIngestNow(
  tenantId: string,
  sourceId: string,
  config: CoreConfig
): Promise<string> {
  const { jobId } = await createQueuedJob(tenantId, sourceId, "conversation_sync", config);
  await runConversationIngestJob(tenantId, jobId, config);
  return jobId;
}

export async function markBotMessengerReply(
  tenantId: string,
  threadPsid: string,
  text: string,
  config: CoreConfig
) {
  const db = getDocClient(config);
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.pageVoiceBotReply(threadPsid),
        text: text.trim(),
        sentAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + 300,
      },
    })
  );
}

async function isBotEchoReply(
  tenantId: string,
  threadPsid: string,
  echoText: string,
  config: CoreConfig
): Promise<boolean> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.pageVoiceBotReply(threadPsid) },
    })
  );
  if (!res.Item) return false;
  const sentAt = new Date(res.Item.sentAt as string).getTime();
  if (Date.now() - sentAt > 120_000) return false;
  const botText = (res.Item.text as string).trim();
  return botText === echoText.trim();
}

export async function captureMessengerEchoPair(
  tenantId: string,
  inbound: MessengerInboundMessage,
  config: CoreConfig
): Promise<boolean> {
  if (inbound.appId && config.metaAppId && inbound.appId === config.metaAppId) {
    console.log("[page-voice] skipping bot API echo", inbound.messageId);
    return false;
  }

  const meta = await getPageVoiceMeta(tenantId, config);
  if (meta.learningPaused) {
    console.log("[page-voice] learning paused, skipping echo", inbound.messageId);
    return false;
  }

  const threadPsid = inbound.recipientId;
  if (!threadPsid) {
    console.warn("[page-voice] echo missing recipient PSID", inbound.messageId);
    return false;
  }

  if (await isBotEchoReply(tenantId, threadPsid, inbound.text, config)) {
    console.log("[page-voice] skipping bot echo (text match)", inbound.messageId);
    return false;
  }

  const pending = await readPendingCustomer(tenantId, threadPsid, config);
  if (!pending?.customerText) {
    console.log("[page-voice] no pending customer message for echo", threadPsid);
    return false;
  }

  await appendConversationPairs(
    tenantId,
    [{ customerText: pending.customerText, ownerText: inbound.text }],
    "messenger",
    config,
    {
      customerMessageId: pending.messageId,
      ownerMessageId: inbound.messageId,
      threadPsid,
    }
  );
  await clearPendingCustomer(tenantId, threadPsid, config);

  const sourceId = await ensureConversationSource(tenantId, config);
  if (!(await hasActiveJobForSource(tenantId, sourceId, config))) {
    await runConversationIngestNow(tenantId, sourceId, config);
  }

  console.log("[page-voice] captured echo pair for", threadPsid, "tenant", tenantId);
  return true;
}

export async function listPreviewPairs(
  tenantId: string,
  config: CoreConfig,
  limit = PREVIEW_LIMIT
): Promise<ConversationPair[]> {
  const db = getDocClient(config);
  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": "PAGE_VOICE#PAIR#",
      },
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return (res.Items ?? []).map((item) => ({
    pairId: item.pairId as string,
    customerText: item.customerText as string,
    ownerText: item.ownerText as string,
    platform: item.platform as ConversationPair["platform"],
    capturedAt: item.capturedAt as string,
  }));
}

export async function listAllConversationPairs(
  tenantId: string,
  config: CoreConfig,
  limit = EXPORT_LIMIT
): Promise<ConversationPair[]> {
  const db = getDocClient(config);
  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": "PAGE_VOICE#PAIR#",
      },
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return (res.Items ?? []).map((item) => ({
    pairId: item.pairId as string,
    customerText: item.customerText as string,
    ownerText: item.ownerText as string,
    platform: item.platform as ConversationPair["platform"],
    capturedAt: item.capturedAt as string,
  }));
}

export async function exportPageVoiceHistory(auth: AuthContext, config: CoreConfig) {
  await assertConversationIngestEnabled(auth, config);
  const pairs = await listAllConversationPairs(auth.tenantId, config);
  return ok({
    format: "commercechat-page-voice-v1",
    pairCount: pairs.length,
    pairs: pairs.map((p) => ({
      customerText: p.customerText,
      ownerText: p.ownerText,
      platform: p.platform,
      capturedAt: p.capturedAt,
    })),
  });
}

export async function getPageVoiceStatus(auth: AuthContext, config: CoreConfig) {
  const tenantConfig = await getTenantConfig(auth, config);
  const conversationIngestEnabled = Boolean(tenantConfig.data?.featureFlags?.conversationIngest);
  const meta = await getPageVoiceMeta(auth.tenantId, config);
  const preview = await listPreviewPairs(auth.tenantId, config);
  return ok({
    conversationIngestEnabled,
    sourceId: meta.sourceId ?? null,
    learningPaused: meta.learningPaused,
    pairCount: meta.pairCount,
    vectorCount: meta.vectorCount,
    lastCaptureAt: meta.lastCaptureAt ?? null,
    lastSyncAt: meta.lastSyncAt ?? null,
    platform: meta.platform,
    preview: preview.map((p) => ({
      customerText: p.customerText,
      ownerText: p.ownerText,
      capturedAt: p.capturedAt,
    })),
  });
}

export async function updatePageVoiceSettings(
  auth: AuthContext,
  body: { learningPaused?: boolean },
  config: CoreConfig
) {
  await assertConversationIngestEnabled(auth, config);
  const patch: Partial<PageVoiceMeta> = {};
  if (typeof body.learningPaused === "boolean") {
    patch.learningPaused = body.learningPaused;
  }
  const meta = await savePageVoiceMeta(auth.tenantId, patch, config);
  return ok({
    learningPaused: meta.learningPaused,
    pairCount: meta.pairCount,
  });
}

export async function uploadPageVoiceHistory(
  auth: AuthContext,
  filename: string,
  fileContent: string,
  config: CoreConfig
) {
  await assertConversationIngestEnabled(auth, config);
  const pairs = parseConversationFile(filename, fileContent);
  const result = await appendConversationPairs(auth.tenantId, pairs, "upload", config);
  const sourceId = await ensureConversationSource(auth.tenantId, config);

  if (!(await hasActiveJobForSource(auth.tenantId, sourceId, config))) {
    const jobId = await runConversationIngestNow(auth.tenantId, sourceId, config);
    return ok({ ...result, sourceId, jobId, status: "completed" });
  }

  return ok({ ...result, sourceId, status: "queued" });
}

export async function syncPageVoice(auth: AuthContext, config: CoreConfig) {
  await assertConversationIngestEnabled(auth, config);
  const meta = await getPageVoiceMeta(auth.tenantId, config);
  if (!meta.pairCount) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "No conversation pairs to sync", 400);
  }

  const sourceId = await ensureConversationSource(auth.tenantId, config);
  if (await hasActiveJobForSource(auth.tenantId, sourceId, config)) {
    throw new ApiError(
      ErrorCodes.VALIDATION_ERROR,
      "A sync is already in progress",
      409
    );
  }

  const jobId = await runConversationIngestNow(auth.tenantId, sourceId, config);

  return ok({
    jobId,
    sourceId,
    status: "completed",
    type: "conversation_sync",
  });
}

export async function tenantHasPageVoiceVectors(
  tenantId: string,
  config: CoreConfig
): Promise<boolean> {
  const meta = await getPageVoiceMeta(tenantId, config);
  return meta.vectorCount > 0;
}
