import { GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  ApiError,
  ErrorCodes,
  generateId,
  ok,
  type AiWallet,
  type AiWalletLedgerEntry,
  type AuthContext,
} from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { listTenantPushTokensForRoles, deletePushDevice } from "../devices/service";
import { createEmailProvider } from "../email/provider";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { sendExpoPushMessages, type ExpoPushTicket } from "../push/expo";

const DEFAULT_CURRENCY = "LKR";
const DEFAULT_LOW_BALANCE_MINOR = 50_000;
const DEFAULT_USD_TO_LKR = 310;
const DEFAULT_MARKUP_PCT = 30;

const MODEL_PRICES_USD_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
};

function assertOwner(auth: AuthContext) {
  if (auth.role !== "owner") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Owner access required", 403);
  }
}

function walletStatus(balanceMinor: number, lowBalanceThresholdMinor: number): AiWallet["status"] {
  if (balanceMinor <= 0) return "empty";
  if (balanceMinor <= lowBalanceThresholdMinor) return "low";
  return "active";
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function estimateAiUsageCostMinor(input: {
  model?: string | null;
  inputTokens: number;
  outputTokens: number;
  currency?: string;
}) {
  const model = input.model || "gpt-4o-mini";
  const prices = MODEL_PRICES_USD_PER_1M[model] ?? MODEL_PRICES_USD_PER_1M["gpt-4o-mini"]!;
  const usd =
    (Math.max(0, input.inputTokens) * prices.input + Math.max(0, input.outputTokens) * prices.output) /
    1_000_000;
  const markup = 1 + envNumber("AI_WALLET_MARKUP_PCT", DEFAULT_MARKUP_PCT) / 100;
  const currency = input.currency ?? DEFAULT_CURRENCY;
  const converted = currency === "USD" ? usd : usd * envNumber("AI_WALLET_USD_TO_LKR", DEFAULT_USD_TO_LKR);
  return Math.max(1, Math.ceil(converted * markup * 100));
}

async function getTenantConfigFlags(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.config() },
    })
  );
  return ((res.Item?.featureFlags as Record<string, boolean> | undefined) ?? {}) as Record<string, boolean>;
}

async function getTenantProfileForWalletNotice(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() },
    })
  );
  return {
    ownerEmail: (res.Item?.ownerEmail as string | undefined)?.trim() || null,
    storeName: (res.Item?.storeName as string | undefined)?.trim() || "your store",
  };
}

async function markWalletNoticeSent(
  tenantId: string,
  key: "lowBalanceNotifiedAt" | "emptyBalanceNotifiedAt",
  config: CoreConfig
) {
  const db = getDocClient(config);
  const now = new Date().toISOString();
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.aiWallet() },
      UpdateExpression: `SET ${key} = :sent, updatedAt = :u`,
      ExpressionAttributeValues: {
        ":sent": now,
        ":u": now,
      },
    })
  );
}

async function sendWalletPushNotice(
  tenantId: string,
  title: string,
  body: string,
  config: CoreConfig
) {
  const { tokens, keys } = await listTenantPushTokensForRoles(tenantId, ["owner", "admin"], config);
  if (!tokens.length) return;
  const tickets = await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title,
      body,
      sound: "default" as const,
      priority: "high" as const,
      data: {
        type: "ai_wallet",
        route: "/(tabs)/settings",
      },
    }))
  );
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i] as ExpoPushTicket | undefined;
    const key = keys[i];
    if (!ticket || ticket.status === "ok" || !key) continue;
    const err = ticket.details?.error ?? ticket.message;
    if (err === "DeviceNotRegistered" || err === "InvalidCredentials") {
      await deletePushDevice(tenantId, key.userId, key.deviceKey, config);
    }
  }
}

async function maybeSendWalletNotice(
  tenantId: string,
  status: AiWallet["status"],
  balanceMinor: number,
  config: CoreConfig
) {
  if (status !== "low" && status !== "empty") return;
  const wallet = await getAiWalletRaw(tenantId, config);
  if (status === "low" && (wallet as AiWallet & { lowBalanceNotifiedAt?: string }).lowBalanceNotifiedAt) return;
  if (status === "empty" && (wallet as AiWallet & { emptyBalanceNotifiedAt?: string }).emptyBalanceNotifiedAt) return;

  const profile = await getTenantProfileForWalletNotice(tenantId, config);
  const amount = `LKR ${(Math.max(0, balanceMinor) / 100).toLocaleString()}`;
  const appUrl = config.appUrl.replace(/\/$/, "");
  const title = status === "empty" ? "AI credit empty" : "AI credit is low";
  const body =
    status === "empty"
      ? "AI replies are paused and new messages are going to manual reply mode."
      : `Your AI wallet balance is ${amount}. Top up soon to keep auto-replies running.`;

  if (profile.ownerEmail) {
    await createEmailProvider(config).sendRawEmail(
      profile.ownerEmail,
      `CommerceChat — ${title}`,
      [
        `Hi,`,
        ``,
        `${profile.storeName}: ${body}`,
        ``,
        `Current AI wallet balance: ${amount}`,
        `Open billing to top up: ${appUrl}/billing`,
      ].join("\n")
    );
  }
  await sendWalletPushNotice(tenantId, title, body, config);
  await markWalletNoticeSent(
    tenantId,
    status === "empty" ? "emptyBalanceNotifiedAt" : "lowBalanceNotifiedAt",
    config
  );
}

export async function getAiWalletRaw(tenantId: string, config: CoreConfig): Promise<AiWallet> {
  const db = getDocClient(config);
  const [walletRes, flags] = await Promise.all([
    db.send(
      new GetCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(tenantId), SK: Keys.aiWallet() },
      })
    ),
    getTenantConfigFlags(tenantId, config).catch(() => ({} as Record<string, boolean>)),
  ]);
  const balanceMinor = Number(walletRes.Item?.balanceMinor ?? 0);
  const lowBalanceThresholdMinor = Number(walletRes.Item?.lowBalanceThresholdMinor ?? DEFAULT_LOW_BALANCE_MINOR);
  const prepaidAiEnabled = Boolean(flags.prepaidAiEnabled ?? walletRes.Item?.prepaidAiEnabled ?? false);
  const status = prepaidAiEnabled
    ? walletStatus(balanceMinor, lowBalanceThresholdMinor)
    : "inactive";
  return {
    tenantId,
    currency: String(walletRes.Item?.currency ?? DEFAULT_CURRENCY),
    balanceMinor,
    status,
    lowBalanceThresholdMinor,
    prepaidAiEnabled,
    lowBalanceNotifiedAt: walletRes.Item?.lowBalanceNotifiedAt as string | undefined,
    emptyBalanceNotifiedAt: walletRes.Item?.emptyBalanceNotifiedAt as string | undefined,
    updatedAt: String(walletRes.Item?.updatedAt ?? new Date(0).toISOString()),
  } as AiWallet;
}

async function setPrepaidFlags(
  tenantId: string,
  config: CoreConfig,
  flags: { prepaidAiEnabled?: boolean; prepaidAiPaused?: boolean; manualRepliesOnly?: boolean }
) {
  const existing = await getTenantConfigFlags(tenantId, config).catch(() => ({} as Record<string, boolean>));
  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.config() },
      UpdateExpression: "SET featureFlags = :f, updatedAt = :u",
      ExpressionAttributeValues: {
        ":f": { ...existing, ...flags },
        ":u": new Date().toISOString(),
      },
    })
  );
}

export async function pauseAiForEmptyWallet(tenantId: string, config: CoreConfig) {
  await setPrepaidFlags(tenantId, config, {
    prepaidAiEnabled: true,
    prepaidAiPaused: true,
    manualRepliesOnly: true,
  });
}

export async function aiWalletAllowsAi(tenantId: string, config: CoreConfig) {
  const wallet = await getAiWalletRaw(tenantId, config);
  if (!wallet.prepaidAiEnabled) return { allowed: true, wallet };
  if (wallet.balanceMinor > 0) return { allowed: true, wallet };
  await pauseAiForEmptyWallet(tenantId, config);
  await maybeSendWalletNotice(tenantId, "empty", wallet.balanceMinor, config).catch((err) =>
    console.warn("[ai-wallet] empty notice failed", err instanceof Error ? err.message : err)
  );
  return { allowed: false, wallet: { ...wallet, status: "empty" as const } };
}

async function putLedgerEntry(entry: AiWalletLedgerEntry, config: CoreConfig) {
  const db = getDocClient(config);
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(entry.tenantId),
        SK: Keys.aiCredit(entry.createdAt, entry.id),
        ...entry,
      },
    })
  );
}

export async function listAiWalletLedger(tenantId: string, config: CoreConfig, limit = 20) {
  const db = getDocClient(config);
  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": "AI_CREDIT#",
      },
      ScanIndexForward: false,
      Limit: Math.min(Math.max(limit, 1), 50),
    })
  );
  return (res.Items ?? []).map((item) => {
    const { PK: _pk, SK: _sk, ...entry } = item;
    return entry as AiWalletLedgerEntry;
  });
}

export async function getAiWalletOverview(auth: AuthContext, config: CoreConfig) {
  const [wallet, ledger] = await Promise.all([
    getAiWalletRaw(auth.tenantId, config),
    listAiWalletLedger(auth.tenantId, config),
  ]);
  return ok({ wallet, ledger });
}

export async function creditAiWallet(
  auth: AuthContext,
  body: { amountMinor: number; currency?: string; reason?: "topup" | "manual_adjustment"; resumeAi?: boolean },
  config: CoreConfig
) {
  assertOwner(auth);
  const amountMinor = Math.floor(Number(body.amountMinor));
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "amountMinor must be greater than zero", 400);
  }
  const now = new Date().toISOString();
  const currency = body.currency ?? DEFAULT_CURRENCY;
  const db = getDocClient(config);
  const walletBefore = await getAiWalletRaw(auth.tenantId, config);
  const lowBalanceThresholdMinor = walletBefore.lowBalanceThresholdMinor || DEFAULT_LOW_BALANCE_MINOR;
  const balanceAfterMinor = walletBefore.balanceMinor + amountMinor;
  const entry: AiWalletLedgerEntry = {
    id: generateId("ai_credit_"),
    tenantId: auth.tenantId,
    type: body.reason === "manual_adjustment" ? "adjustment" : "credit",
    amountMinor,
    currency,
    reason: body.reason ?? "topup",
    balanceAfterMinor,
    createdAt: now,
  };
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: config.tableName,
            Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.aiWallet() },
            UpdateExpression:
              "SET currency = :c, lowBalanceThresholdMinor = if_not_exists(lowBalanceThresholdMinor, :low), updatedAt = :u ADD balanceMinor :amount",
            ExpressionAttributeValues: {
              ":c": currency,
              ":low": lowBalanceThresholdMinor,
              ":u": now,
              ":amount": amountMinor,
            },
          },
        },
        {
          Put: {
            TableName: config.tableName,
            Item: {
              PK: Keys.tenantPk(auth.tenantId),
              SK: Keys.aiCredit(entry.createdAt, entry.id),
              ...entry,
            },
          },
        },
      ],
    })
  );
  if (balanceAfterMinor > lowBalanceThresholdMinor) {
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.aiWallet() },
        UpdateExpression: "SET updatedAt = :u REMOVE lowBalanceNotifiedAt, emptyBalanceNotifiedAt",
        ExpressionAttributeValues: { ":u": now },
      })
    );
  }
  await setPrepaidFlags(auth.tenantId, config, {
    prepaidAiEnabled: true,
    prepaidAiPaused: body.resumeAi ? false : walletBefore.status === "empty",
    ...(body.resumeAi ? { manualRepliesOnly: false } : {}),
  });
  return getAiWalletOverview(auth, config);
}

export async function resumeAiWalletReplies(auth: AuthContext, config: CoreConfig) {
  assertOwner(auth);
  const wallet = await getAiWalletRaw(auth.tenantId, config);
  if (!wallet.prepaidAiEnabled) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Prepaid AI wallet is not enabled", 400);
  }
  if (wallet.balanceMinor <= 0) {
    throw new ApiError(ErrorCodes.PLAN_LIMIT_EXCEEDED, "Top up AI wallet before resuming AI replies", 403);
  }
  await setPrepaidFlags(auth.tenantId, config, {
    prepaidAiEnabled: true,
    prepaidAiPaused: false,
    manualRepliesOnly: false,
  });
  return getAiWalletOverview(auth, config);
}

export async function debitAiWalletForUsage(
  tenantId: string,
  input: { model?: string | null; inputTokens: number; outputTokens: number; conversationId?: string },
  config: CoreConfig
) {
  const wallet = await getAiWalletRaw(tenantId, config);
  if (!wallet.prepaidAiEnabled) {
    return { enabled: false, debitedMinor: 0, wallet };
  }
  const amountMinor = estimateAiUsageCostMinor({ ...input, currency: wallet.currency });
  const now = new Date().toISOString();
  const balanceAfterMinor = Math.max(0, wallet.balanceMinor - amountMinor);
  const status = walletStatus(balanceAfterMinor, wallet.lowBalanceThresholdMinor);
  const entry: AiWalletLedgerEntry = {
    id: generateId("ai_debit_"),
    tenantId,
    type: "debit",
    amountMinor: -amountMinor,
    currency: wallet.currency,
    reason: input.conversationId ? "chat_turn" : "test_chat",
    model: input.model ?? undefined,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    conversationId: input.conversationId,
    balanceAfterMinor,
    createdAt: now,
  };
  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.aiWallet() },
      UpdateExpression: "SET balanceMinor = :b, currency = :c, updatedAt = :u",
      ExpressionAttributeValues: {
        ":b": balanceAfterMinor,
        ":c": wallet.currency,
        ":u": now,
      },
    })
  );
  await putLedgerEntry(entry, config);
  if (status === "empty") {
    await pauseAiForEmptyWallet(tenantId, config);
  }
  if (status === "low" || status === "empty") {
    await maybeSendWalletNotice(tenantId, status, balanceAfterMinor, config).catch((err) =>
      console.warn("[ai-wallet] notice failed", err instanceof Error ? err.message : err)
    );
  }
  return {
    enabled: true,
    debitedMinor: amountMinor,
    wallet: {
      ...wallet,
      balanceMinor: balanceAfterMinor,
      status,
      updatedAt: now,
    },
  };
}
