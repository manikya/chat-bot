import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  ApiError,
  ErrorCodes,
  ok,
  type AuthContext,
  type ConversationHandlingMode,
} from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { assertNotViewer } from "../auth/roles";
import { getChannelRecord } from "../channels/service";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { getTenantConfig } from "../tenant/service";
import { resolveTenantProfile } from "../tenant/status";
import {
  findConversationById,
  persistMessage,
  type ConversationState,
} from "./conversation";
import { sendInstagramReply } from "../meta/instagram-outbound";
import { sendMessengerReply } from "../meta/messenger-outbound";
import { sendWhatsAppReply } from "../meta/whatsapp-outbound";

const META_CHANNELS = new Set(["whatsapp", "messenger", "instagram"]);

export interface UpdateHandlingBody {
  mode: ConversationHandlingMode;
  /** When taking over, send tenant handoffMessage to the customer first. */
  notifyCustomer?: boolean;
  /** Agent user id (JWT sub) — for mobile app assignment tracking. */
  assignedToUserId?: string | null;
}

export interface ManualReplyBody {
  content: string;
}

async function assertHumanHandoffEnabled(auth: AuthContext, config: CoreConfig) {
  const [tenantConfig, profile] = await Promise.all([
    getTenantConfig(auth, config),
    resolveTenantProfile(auth.tenantId, config),
  ]);
  const plan = String(profile.plan ?? "trial");
  const fromFlags = Boolean(tenantConfig.data?.featureFlags?.humanHandoff);
  const fromPlan = ["trial", "pro", "business", "enterprise"].includes(plan);
  if (!fromFlags && !fromPlan) {
    throw new ApiError(
      ErrorCodes.FORBIDDEN,
      "Human handoff is not available on your plan. Upgrade to Pro or Business.",
      403
    );
  }
}

async function loadTenantHandoffMessage(auth: AuthContext, config: CoreConfig) {
  const tenantConfig = await getTenantConfig(auth, config);
  const msg = tenantConfig.data?.prompts?.handoffMessage?.trim();
  return msg || "A team member will take over this chat shortly.";
}

export async function sendConversationOutbound(
  tenantId: string,
  conversation: ConversationState,
  text: string,
  config: CoreConfig
) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Message content is required", 400);
  }

  switch (conversation.channel) {
    case "whatsapp": {
      const channel = await getChannelRecord(tenantId, "whatsapp", config);
      const phoneNumberId = channel?.phoneNumberId as string | undefined;
      if (!channel || channel.status !== "connected" || !phoneNumberId) {
        throw new ApiError(ErrorCodes.VALIDATION_ERROR, "WhatsApp is not connected", 400);
      }
      await sendWhatsAppReply(
        tenantId,
        phoneNumberId,
        conversation.externalUserId,
        trimmed,
        config
      );
      return;
    }
    case "messenger":
      await sendMessengerReply(tenantId, conversation.externalUserId, trimmed, config);
      return;
    case "instagram":
      await sendInstagramReply(tenantId, conversation.externalUserId, trimmed, config);
      return;
    case "web":
      throw new ApiError(
        ErrorCodes.VALIDATION_ERROR,
        "Manual replies to web widget chats are not supported yet",
        400
      );
    default:
      throw new ApiError(
        ErrorCodes.VALIDATION_ERROR,
        `Manual replies are not supported for channel: ${conversation.channel}`,
        400
      );
  }
}

async function patchConversationHandling(
  tenantId: string,
  conversation: ConversationState,
  patch: {
    handlingMode: ConversationHandlingMode;
    assignedToUserId?: string | null;
    handoffAt?: string | null;
  },
  config: CoreConfig
) {
  const db = getDocClient(config);
  const now = new Date().toISOString();

  if (patch.handlingMode === "bot") {
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: {
          PK: Keys.tenantPk(tenantId),
          SK: Keys.conversation(conversation.channel, conversation.externalUserId),
        },
        UpdateExpression:
          "SET handlingMode = :mode, updatedAt = :u REMOVE assignedToUserId, handoffAt",
        ExpressionAttributeValues: { ":mode": "bot", ":u": now },
      })
    );
    const { assignedToUserId: _a, handoffAt: _h, ...rest } = conversation;
    return { ...rest, handlingMode: "bot" as const, updatedAt: now };
  }

  const values: Record<string, unknown> = {
    ":mode": "human",
    ":u": now,
  };
  let updateExpression = "SET handlingMode = :mode, updatedAt = :u";
  if (patch.assignedToUserId) {
    values[":assigned"] = patch.assignedToUserId;
    updateExpression += ", assignedToUserId = :assigned";
  }
  if (patch.handoffAt) {
    values[":handoffAt"] = patch.handoffAt;
    updateExpression += ", handoffAt = :handoffAt";
  }

  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.conversation(conversation.channel, conversation.externalUserId),
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: values,
    })
  );

  return {
    ...conversation,
    handlingMode: "human" as const,
    assignedToUserId: patch.assignedToUserId ?? conversation.assignedToUserId,
    handoffAt: patch.handoffAt ?? conversation.handoffAt,
    updatedAt: now,
  };
}

export function conversationHandlingDto(conv: ConversationState) {
  return {
    handlingMode: (conv.handlingMode ?? "bot") as ConversationHandlingMode,
    assignedToUserId: conv.assignedToUserId ?? null,
    handoffAt: conv.handoffAt ?? null,
    manualReplySupported: META_CHANNELS.has(conv.channel),
  };
}

/** Mobile-friendly: PATCH /conversations/{id}/handling */
export async function updateConversationHandling(
  auth: AuthContext,
  conversationId: string,
  body: UpdateHandlingBody,
  config: CoreConfig
) {
  assertNotViewer(auth);
  await assertHumanHandoffEnabled(auth, config);

  const mode = body.mode;
  if (mode !== "bot" && mode !== "human") {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "mode must be bot or human", 400);
  }

  const conv = await findConversationById(auth.tenantId, conversationId, config);
  if (!conv) throw new ApiError(ErrorCodes.NOT_FOUND, "Conversation not found", 404);

  let updated = conv;

  if (mode === "human") {
    if (body.notifyCustomer) {
      const handoffText = await loadTenantHandoffMessage(auth, config);
      if (conv.channel !== "web") {
        await sendConversationOutbound(auth.tenantId, conv, handoffText, config);
        await persistMessage(auth.tenantId, conv, "outbound", "assistant", handoffText, config, {
          manual: false,
          handoff: true,
        });
      }
    }

    updated = await patchConversationHandling(
      auth.tenantId,
      conv,
      {
        handlingMode: "human",
        assignedToUserId: body.assignedToUserId ?? auth.userId,
        handoffAt: body.notifyCustomer ? new Date().toISOString() : conv.handoffAt ?? null,
      },
      config
    );
  } else {
    updated = await patchConversationHandling(
      auth.tenantId,
      conv,
      {
        handlingMode: "bot",
        assignedToUserId: null,
        handoffAt: null,
      },
      config
    );
  }

  return ok({
    conversationId: updated.conversationId,
    ...conversationHandlingDto(updated),
  });
}

/** Mobile-friendly: POST /conversations/{id}/reply */
export async function sendManualConversationReply(
  auth: AuthContext,
  conversationId: string,
  body: ManualReplyBody,
  config: CoreConfig
) {
  assertNotViewer(auth);
  await assertHumanHandoffEnabled(auth, config);

  const content = body.content?.trim();
  if (!content) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "content is required", 400);
  }

  const conv = await findConversationById(auth.tenantId, conversationId, config);
  if (!conv) throw new ApiError(ErrorCodes.NOT_FOUND, "Conversation not found", 404);

  const mode = conv.handlingMode ?? "bot";
  if (mode !== "human") {
    throw new ApiError(
      ErrorCodes.VALIDATION_ERROR,
      "Switch conversation to human handling before sending a manual reply",
      400
    );
  }

  await sendConversationOutbound(auth.tenantId, conv, content, config);

  const messageId = await persistMessage(auth.tenantId, conv, "outbound", "assistant", content, config, {
    manual: true,
    sentByUserId: auth.userId,
    sentByEmail: auth.email || undefined,
  });

  return ok({
    conversationId: conv.conversationId,
    messageId,
    content,
    channel: conv.channel,
    handlingMode: "human" as const,
  });
}
