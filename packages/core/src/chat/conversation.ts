import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { generateId } from "@commercechat/shared";
import type { ChatIntent, ChatSubIntent, ConversationHandlingMode, FunnelStage, QualificationState } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";

export type ConversationProfileLookupStatus = "ok" | "unavailable";

export interface ConversationProfilePatch {
  customerName?: string;
  profilePicUrl?: string;
  profileLookupStatus?: ConversationProfileLookupStatus;
  profileLookupAt?: string;
}

export interface ConversationState {
  conversationId: string;
  tenantId: string;
  channel: string;
  externalUserId: string;
  customerName?: string;
  profilePicUrl?: string;
  profileLookupStatus?: ConversationProfileLookupStatus;
  profileLookupAt?: string;
  cartId?: string;
  status: string;
  handlingMode?: ConversationHandlingMode;
  assignedToUserId?: string;
  handoffAt?: string;
  contactRequestAt?: string;
  funnelStage?: FunnelStage;
  lastIntent?: ChatIntent;
  lastSubIntent?: ChatSubIntent;
  qualification?: QualificationState;
  messageCount: number;
  lastInboundAt?: string;
  lastOutboundAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMessage {
  messageId: string;
  conversationId: string;
  tenantId: string;
  channel: string;
  direction: "inbound" | "outbound";
  role: "user" | "assistant";
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const HISTORY_LIMIT = 10;

export async function resolveConversation(
  tenantId: string,
  channel: string,
  externalUserId: string,
  config: CoreConfig
): Promise<ConversationState> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.conversation(channel, externalUserId),
      },
    })
  );
  if (res.Item) {
    const { PK: _pk, SK: _sk, ...conv } = res.Item;
    return conv as ConversationState;
  }

  const now = new Date().toISOString();
  const conv: ConversationState = {
    conversationId: generateId("conv_"),
    tenantId,
    channel,
    externalUserId,
    status: "active",
    handlingMode: "bot",
    funnelStage: "discover",
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.conversation(channel, externalUserId),
        ...conv,
      },
    })
  );
  return conv;
}

export async function loadMessageHistory(
  tenantId: string,
  conversationId: string,
  config: CoreConfig
): Promise<StoredMessage[]> {
  const db = getDocClient(config);
  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": `MSG#${conversationId}#`,
      },
      ScanIndexForward: false,
      Limit: HISTORY_LIMIT,
    })
  );
  const items = (res.Items ?? []) as StoredMessage[];
  return items.reverse();
}

export async function persistMessage(
  tenantId: string,
  conversation: ConversationState,
  direction: "inbound" | "outbound",
  role: "user" | "assistant",
  content: string,
  config: CoreConfig,
  metadata?: Record<string, unknown>
) {
  const now = new Date().toISOString();
  const messageId = generateId("msg_");
  const db = getDocClient(config);

  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.message(conversation.conversationId, now),
        messageId,
        conversationId: conversation.conversationId,
        tenantId,
        channel: conversation.channel,
        direction,
        role,
        type: "text",
        content,
        metadata,
        createdAt: now,
      },
    })
  );

  const names: Record<string, string> = {
    "#updatedAt": "updatedAt",
    "#messageCount": "messageCount",
  };
  const values: Record<string, unknown> = {
    ":u": now,
    ":one": 1,
  };
  const setParts = ["#updatedAt = :u"];

  if (direction === "inbound") {
    names["#lastInboundAt"] = "lastInboundAt";
    values[":in"] = now;
    setParts.push("#lastInboundAt = :in");
  } else {
    names["#lastOutboundAt"] = "lastOutboundAt";
    values[":out"] = now;
    setParts.push("#lastOutboundAt = :out");
  }

  const updateExpr = `SET ${setParts.join(", ")} ADD #messageCount :one`;

  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.conversation(conversation.channel, conversation.externalUserId),
      },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );

  return messageId;
}

export function historyToChatMessages(messages: StoredMessage[]) {
  return messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

function messengerFallbackLabel(psid: string): string {
  const digits = psid.replace(/\D/g, "");
  const tail = (digits.length >= 4 ? digits : psid).slice(-4);
  return `Messenger user •••${tail}`;
}

export function customerDisplayName(conv: ConversationState): string {
  if (conv.customerName?.trim()) return conv.customerName.trim();
  if (conv.channel === "web" || conv.channel === "test") {
    const suffix = conv.externalUserId.replace(/^onboarding-/, "").slice(-6);
    return `Visitor ${suffix}`;
  }
  if (conv.channel === "messenger") {
    return messengerFallbackLabel(conv.externalUserId);
  }
  return conv.externalUserId;
}

export async function updateConversationProfile(
  tenantId: string,
  conversation: Pick<ConversationState, "channel" | "externalUserId">,
  patch: ConversationProfilePatch,
  config: CoreConfig
) {
  const db = getDocClient(config);
  const now = patch.profileLookupAt ?? new Date().toISOString();
  const names: Record<string, string> = {
    "#updatedAt": "updatedAt",
    "#profileLookupAt": "profileLookupAt",
    "#profileLookupStatus": "profileLookupStatus",
  };
  const values: Record<string, unknown> = {
    ":updatedAt": now,
    ":profileLookupAt": now,
    ":profileLookupStatus": patch.profileLookupStatus ?? "unavailable",
  };
  const setParts = [
    "#updatedAt = :updatedAt",
    "#profileLookupAt = :profileLookupAt",
    "#profileLookupStatus = :profileLookupStatus",
  ];

  if (patch.customerName !== undefined) {
    names["#customerName"] = "customerName";
    values[":customerName"] = patch.customerName;
    setParts.push("#customerName = :customerName");
  }
  if (patch.profilePicUrl !== undefined) {
    names["#profilePicUrl"] = "profilePicUrl";
    values[":profilePicUrl"] = patch.profilePicUrl;
    setParts.push("#profilePicUrl = :profilePicUrl");
  }

  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.conversation(conversation.channel, conversation.externalUserId),
      },
      UpdateExpression: `SET ${setParts.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

export async function updateConversationFunnel(
  tenantId: string,
  conversation: Pick<ConversationState, "channel" | "externalUserId">,
  funnelStage: FunnelStage,
  config: CoreConfig,
  qualification?: QualificationState,
  intent?: ChatIntent,
  subIntent?: ChatSubIntent
) {
  const db = getDocClient(config);
  const now = new Date().toISOString();
  const names: Record<string, string> = {
    "#funnelStage": "funnelStage",
    "#updatedAt": "updatedAt",
  };
  const values: Record<string, unknown> = {
    ":funnelStage": funnelStage,
    ":updatedAt": now,
  };
  const setParts = ["#funnelStage = :funnelStage", "#updatedAt = :updatedAt"];

  if (qualification !== undefined) {
    names["#qualification"] = "qualification";
    values[":qualification"] = qualification;
    setParts.push("#qualification = :qualification");
  }
  if (intent !== undefined) {
    names["#lastIntent"] = "lastIntent";
    values[":lastIntent"] = intent;
    setParts.push("#lastIntent = :lastIntent");
  }
  if (subIntent !== undefined) {
    names["#lastSubIntent"] = "lastSubIntent";
    values[":lastSubIntent"] = subIntent;
    setParts.push("#lastSubIntent = :lastSubIntent");
  }

  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.conversation(conversation.channel, conversation.externalUserId),
      },
      UpdateExpression: `SET ${setParts.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

export async function setConversationHumanHandling(
  tenantId: string,
  conversation: ConversationState,
  config: CoreConfig,
  options?: { handoffAt?: string }
): Promise<ConversationState> {
  const now = new Date().toISOString();
  const handoffAt = options?.handoffAt ?? conversation.handoffAt ?? now;
  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.conversation(conversation.channel, conversation.externalUserId),
      },
      UpdateExpression: "SET handlingMode = :mode, handoffAt = :handoffAt, updatedAt = :u",
      ExpressionAttributeValues: {
        ":mode": "human",
        ":handoffAt": handoffAt,
        ":u": now,
      },
    })
  );
  return { ...conversation, handlingMode: "human", handoffAt, updatedAt: now };
}

export async function markConversationContactRequestSent(
  tenantId: string,
  conversation: ConversationState,
  config: CoreConfig
): Promise<ConversationState> {
  const now = new Date().toISOString();
  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.conversation(conversation.channel, conversation.externalUserId),
      },
      UpdateExpression: "SET contactRequestAt = :contactRequestAt, updatedAt = :u",
      ExpressionAttributeValues: {
        ":contactRequestAt": now,
        ":u": now,
      },
    })
  );
  return { ...conversation, contactRequestAt: now, updatedAt: now };
}

export async function listTenantConversations(
  tenantId: string,
  config: CoreConfig,
  options?: {
    channel?: string;
    status?: string;
    handlingMode?: ConversationHandlingMode;
    limit?: number;
    cursor?: string;
  }
) {
  const db = getDocClient(config);
  const limit = Math.min(options?.limit ?? 20, 50);
  let startKey: Record<string, unknown> | undefined;
  if (options?.cursor) {
    try {
      startKey = JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8"));
    } catch {
      startKey = undefined;
    }
  }

  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": "CONV#",
      },
      ExclusiveStartKey: startKey,
      Limit: limit * 3,
    })
  );

  let items = (res.Items ?? []).map((item) => {
    const { PK: _pk, SK: _sk, ...conv } = item;
    return conv as ConversationState;
  });

  if (options?.channel) {
    items = items.filter((c) => c.channel === options.channel);
  }
  if (options?.status) {
    items = items.filter((c) => c.status === options.status);
  }
  if (options?.handlingMode) {
    items = items.filter((c) => (c.handlingMode ?? "bot") === options.handlingMode);
  }

  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const page = items.slice(0, limit);
  const hasMore = items.length > limit || !!res.LastEvaluatedKey;
  const nextCursor =
    hasMore && res.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString("base64url")
      : null;

  return {
    items: page.map((c) => ({
      conversationId: c.conversationId,
      channel: c.channel,
      externalUserId: c.externalUserId,
      customerName: customerDisplayName(c),
      status: c.status,
      handlingMode: c.handlingMode ?? "bot",
      funnelStage: c.funnelStage ?? "discover",
      lastIntent: c.lastIntent,
      lastSubIntent: c.lastSubIntent,
      assignedToUserId: c.assignedToUserId ?? null,
      messageCount: c.messageCount,
      lastInboundAt: c.lastInboundAt ?? c.createdAt,
      updatedAt: c.updatedAt,
    })),
    nextCursor,
    hasMore,
  };
}

export async function findConversationById(
  tenantId: string,
  conversationId: string,
  config: CoreConfig
): Promise<ConversationState | null> {
  const db = getDocClient(config);
  let startKey: Record<string, unknown> | undefined;

  do {
    const res = await db.send(
      new QueryCommand({
        TableName: config.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": Keys.tenantPk(tenantId),
          ":sk": "CONV#",
        },
        ExclusiveStartKey: startKey,
      })
    );
    for (const item of res.Items ?? []) {
      if (item.conversationId === conversationId) {
        const { PK: _pk, SK: _sk, ...conv } = item;
        return conv as ConversationState;
      }
    }
    startKey = res.LastEvaluatedKey;
  } while (startKey);

  return null;
}

export async function listConversationMessages(
  tenantId: string,
  conversationId: string,
  config: CoreConfig,
  options?: { limit?: number; order?: "asc" | "desc" }
) {
  const db = getDocClient(config);
  const limit = Math.min(options?.limit ?? 50, 100);
  const orderAsc = options?.order !== "desc";

  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": `MSG#${conversationId}#`,
      },
      ScanIndexForward: orderAsc,
      Limit: limit,
    })
  );

  const items = (res.Items ?? []).map((item) => {
    const { PK: _pk, SK: _sk, tenantId: _t, channel: _c, conversationId: _conv, ...msg } = item;
    return {
      messageId: msg.messageId as string,
      direction: msg.direction as "inbound" | "outbound",
      role: msg.role as "user" | "assistant",
      type: msg.type as string,
      content: msg.content as string,
      createdAt: msg.createdAt as string,
      metadata: msg.metadata as Record<string, unknown> | undefined,
    };
  });

  return {
    items,
    nextCursor: null,
    hasMore: !!res.LastEvaluatedKey,
  };
}

export type { ChatIntent };
