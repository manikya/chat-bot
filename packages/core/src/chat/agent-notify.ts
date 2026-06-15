import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { ConversationHandlingMode } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { createEmailProvider } from "../email/provider";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import type { ConversationState } from "./conversation";
import { customerDisplayName } from "./conversation";

const NOTIFY_DEBOUNCE_SEC = 120;

async function getTenantOwnerEmail(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() },
    })
  );
  return (res.Item?.ownerEmail as string | undefined)?.trim() || null;
}

async function shouldSendAgentNotify(
  tenantId: string,
  conversationId: string,
  config: CoreConfig
): Promise<boolean> {
  const db = getDocClient(config);
  const sk = `AGENT_NOTIFY#${conversationId}`;
  const ttl = Math.floor(Date.now() / 1000) + NOTIFY_DEBOUNCE_SEC;
  try {
    await db.send(
      new PutCommand({
        TableName: config.tableName,
        Item: {
          PK: Keys.tenantPk(tenantId),
          SK: sk,
          ttl,
          createdAt: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(SK)",
      })
    );
    return true;
  } catch (err) {
    const e = err as { name?: string };
    if (e.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

/** Email store owner when a customer messages while conversation is in human mode. */
export async function notifyAgentInboundMessage(
  tenantId: string,
  conversation: ConversationState,
  messagePreview: string,
  config: CoreConfig
) {
  const mode = conversation.handlingMode ?? "bot";
  if (mode !== "human") return;

  const send = await shouldSendAgentNotify(tenantId, conversation.conversationId, config);
  if (!send) return;

  const ownerEmail = await getTenantOwnerEmail(tenantId, config);
  if (!ownerEmail) return;

  const appUrl = config.appUrl.replace(/\/$/, "");
  const customer = customerDisplayName(conversation);
  const preview = messagePreview.slice(0, 280);
  const threadUrl = `${appUrl}/conversations/${conversation.conversationId}`;

  const provider = createEmailProvider(config);
  await provider.sendRawEmail(
    ownerEmail,
    `CommerceChat — new message from ${customer} (${conversation.channel})`,
    [
      `A customer sent a message while this conversation is assigned to your team.`,
      ``,
      `Channel: ${conversation.channel}`,
      `Customer: ${customer}`,
      ``,
      `"${preview}"`,
      ``,
      `Open the conversation to reply:`,
      threadUrl,
    ].join("\n")
  );
}

export function getHandlingMode(
  conversation: Pick<ConversationState, "handlingMode">
): ConversationHandlingMode {
  return conversation.handlingMode === "human" ? "human" : "bot";
}
