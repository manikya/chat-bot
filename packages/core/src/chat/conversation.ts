import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { generateId } from "@commercechat/shared";
import type { ChatIntent } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";

export interface ConversationState {
  conversationId: string;
  tenantId: string;
  channel: string;
  externalUserId: string;
  cartId?: string;
  status: string;
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

export type { ChatIntent };
