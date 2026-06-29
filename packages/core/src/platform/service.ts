import { Buffer } from "buffer";
import { createHash, randomBytes } from "crypto";
import { GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  ApiError,
  ErrorCodes,
  generateId,
  normalizeEmail,
  ok,
  type AuthContext,
  type PlatformUser,
  type PlatformUserRole,
  type PlatformTenantDetail,
  type PlatformTenantList,
  type PlatformTenantSummary,
  type TenantPlan,
  type TenantStatus,
} from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { getUsageForPeriod } from "../chat/usage";
import { getAiWalletRaw } from "../billing/ai-wallet";
import { creditAiWallet } from "../billing/ai-wallet";
import { hashPassword, validatePassword, verifyPassword } from "../auth/password";
import { signAccessToken } from "../auth/jwt";

const VALID_STATUS = new Set<TenantStatus>(["trial", "active", "suspended", "cancelled", "deleted"]);
const VALID_PLAN = new Set<TenantPlan>(["trial", "starter", "pro", "business", "enterprise"]);
type PlatformUserRecord = PlatformUser & { passwordHash?: string };

export interface PlatformTenantQuery {
  q?: string;
  status?: string;
  plan?: string;
  limit?: number;
  cursor?: string;
}

function currentPeriod() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function platformAdminEmails(config: CoreConfig) {
  return (config.platformAdminEmails ?? "")
    .split(",")
    .map((email) => normalizeEmail(email.trim()))
    .filter(Boolean);
}

function tokenHash(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function encodeCursor(key: Record<string, unknown> | undefined) {
  if (!key) return undefined;
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Invalid cursor", 400);
  }
}

async function getPlatformUserByEmail(email: string, config: CoreConfig) {
  const res = await getDocClient(config).send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.platformPk(), SK: Keys.platformUser(email) },
    })
  );
  return res.Item as PlatformUserRecord | undefined;
}

function platformUserDto(item: Record<string, unknown>): PlatformUser {
  return {
    userId: String(item.userId),
    email: String(item.email),
    name: String(item.name ?? item.email),
    role: String(item.role ?? "support") as PlatformUserRole,
    status: String(item.status ?? "active") as PlatformUser["status"],
    createdAt: String(item.createdAt ?? new Date(0).toISOString()),
    updatedAt: item.updatedAt as string | undefined,
    lastLoginAt: item.lastLoginAt as string | undefined,
  };
}

export async function assertPlatformAdmin(auth: AuthContext, config: CoreConfig) {
  if (auth.scope === "platform") {
    const user = await getPlatformUserByEmail(auth.email, config);
    if (user?.status === "active") return platformUserDto(user as unknown as Record<string, unknown>);
    throw new ApiError(ErrorCodes.FORBIDDEN, "Platform admin access required", 403);
  }

  const allowed = platformAdminEmails(config);
  if (!allowed.length || !allowed.includes(normalizeEmail(auth.email))) {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Platform admin access required", 403);
  }
  return {
    userId: auth.userId,
    email: normalizeEmail(auth.email),
    name: auth.email,
    role: "owner" as PlatformUserRole,
    status: "active" as const,
    createdAt: new Date(0).toISOString(),
  };
}

function tenantMatches(item: Record<string, unknown>, query: PlatformTenantQuery) {
  if (query.status && item.status !== query.status) return false;
  if (query.plan && item.plan !== query.plan) return false;
  const q = query.q?.trim().toLowerCase();
  if (!q) return true;
  return [
    item.tenantId,
    item.storeName,
    item.ownerEmail,
    item.websiteUrl,
  ].some((value) => String(value ?? "").toLowerCase().includes(q));
}

async function summarizeTenant(
  item: Record<string, unknown>,
  config: CoreConfig,
  period = currentPeriod()
): Promise<PlatformTenantSummary> {
  const tenantId = String(item.tenantId ?? String(item.PK ?? "").replace(/^TENANT#/, ""));
  const [usage, limitsRes, wallet] = await Promise.all([
    getUsageForPeriod(tenantId, period, config),
    getDocClient(config).send(
      new GetCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(tenantId), SK: Keys.limits() },
      })
    ),
    getAiWalletRaw(tenantId, config).catch(() => undefined),
  ]);

  return {
    tenantId,
    storeName: String(item.storeName ?? "Untitled store"),
    ownerEmail: String(item.ownerEmail ?? ""),
    plan: String(item.plan ?? "trial"),
    status: String(item.status ?? "trial"),
    timezone: item.timezone as string | undefined,
    websiteUrl: item.websiteUrl as string | undefined,
    onboardingStep: item.onboardingStep as string | undefined,
    logoUrl: item.logoUrl as string | undefined,
    widgetApiKeyPrefix: item.widgetApiKeyPrefix as string | undefined,
    createdAt: item.createdAt as string | undefined,
    updatedAt: item.updatedAt as string | undefined,
    billingPeriodEnd: item.billingPeriodEnd as string | undefined,
    trialEndsAt: item.trialEndsAt as string | undefined,
    cancelAtPeriodEnd: Boolean(item.cancelAtPeriodEnd ?? false),
    usage: {
      ...usage,
      maxMessages: Number(limitsRes.Item?.maxMessages ?? 2000),
    },
    aiWallet: wallet,
  };
}

export async function listPlatformTenants(
  auth: AuthContext,
  query: PlatformTenantQuery,
  config: CoreConfig
) {
  await assertPlatformAdmin(auth, config);
  const db = getDocClient(config);
  const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 100);
  const items: PlatformTenantSummary[] = [];
  let startKey = decodeCursor(query.cursor);
  let lastKey: Record<string, unknown> | undefined;

  do {
    const res = await db.send(
      new ScanCommand({
        TableName: config.tableName,
        FilterExpression: "SK = :profile",
        ExpressionAttributeValues: { ":profile": Keys.profile() },
        ExclusiveStartKey: startKey,
        Limit: Math.max(limit * 2, 25),
      })
    );
    lastKey = res.LastEvaluatedKey;

    for (const item of res.Items ?? []) {
      if (!tenantMatches(item, query)) continue;
      items.push(await summarizeTenant(item, config));
    }
    startKey = lastKey;
  } while (items.length < limit && startKey);

  return ok<PlatformTenantList>({
    items,
    total: items.length,
    nextCursor: encodeCursor(lastKey),
  });
}

export async function getPlatformTenant(
  auth: AuthContext,
  tenantId: string,
  config: CoreConfig
) {
  await assertPlatformAdmin(auth, config);
  const db = getDocClient(config);
  const [profileRes, configRes, limitsRes] = await Promise.all([
    db.send(new GetCommand({ TableName: config.tableName, Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() } })),
    db.send(new GetCommand({ TableName: config.tableName, Key: { PK: Keys.tenantPk(tenantId), SK: Keys.config() } })),
    db.send(new GetCommand({ TableName: config.tableName, Key: { PK: Keys.tenantPk(tenantId), SK: Keys.limits() } })),
  ]);
  if (!profileRes.Item) throw new ApiError(ErrorCodes.NOT_FOUND, "Tenant not found", 404);

  const summary = await summarizeTenant(profileRes.Item, config);
  const detail: PlatformTenantDetail = {
    ...summary,
    config: configRes.Item ? (configRes.Item as PlatformTenantDetail["config"]) : undefined,
    limits: limitsRes.Item ? (limitsRes.Item as PlatformTenantDetail["limits"]) : undefined,
  };
  return ok(detail);
}

export async function updatePlatformTenant(
  auth: AuthContext,
  tenantId: string,
  patch: { status?: TenantStatus; plan?: TenantPlan },
  config: CoreConfig
) {
  await assertPlatformAdmin(auth, config);
  const names: Record<string, string> = { "#updatedAt": "updatedAt" };
  const values: Record<string, unknown> = { ":u": new Date().toISOString() };
  const sets = ["#updatedAt = :u"];

  if (patch.status !== undefined) {
    if (!VALID_STATUS.has(patch.status)) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Invalid tenant status", 400);
    }
    names["#status"] = "status";
    values[":status"] = patch.status;
    sets.push("#status = :status");
  }
  if (patch.plan !== undefined) {
    if (!VALID_PLAN.has(patch.plan)) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Invalid tenant plan", 400);
    }
    names["#plan"] = "plan";
    values[":plan"] = patch.plan;
    sets.push("#plan = :plan");
  }
  if (sets.length === 1) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "No supported tenant fields to update", 400);
  }

  try {
    await getDocClient(config).send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(PK)",
      })
    );
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") {
      throw new ApiError(ErrorCodes.NOT_FOUND, "Tenant not found", 404);
    }
    throw err;
  }

  return getPlatformTenant(auth, tenantId, config);
}

export async function topUpPlatformTenantAiWallet(
  auth: AuthContext,
  tenantId: string,
  body: { amountMinor: number; currency?: string; resumeAi?: boolean },
  config: CoreConfig
) {
  await assertPlatformAdmin(auth, config);
  await getPlatformTenant(auth, tenantId, config);
  return creditAiWallet(
    {
      tenantId,
      userId: auth.userId,
      role: "owner",
      email: auth.email,
      scope: "platform",
      platformRole: auth.platformRole,
    },
    {
      amountMinor: body.amountMinor,
      currency: body.currency,
      reason: "topup",
      resumeAi: body.resumeAi,
    },
    config
  );
}

function assertPlatformOwner(user: PlatformUser) {
  if (user.role !== "owner") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Platform owner access required", 403);
  }
}

export async function listPlatformUsers(auth: AuthContext, config: CoreConfig) {
  await assertPlatformAdmin(auth, config);
  const res = await getDocClient(config).send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": Keys.platformPk(), ":sk": "USER#" },
    })
  );
  return ok({ items: (res.Items ?? []).map(platformUserDto) });
}

export async function createPlatformUser(
  auth: AuthContext,
  input: { email: string; name: string; password: string; role?: PlatformUserRole },
  config: CoreConfig
) {
  const actor = await assertPlatformAdmin(auth, config);
  assertPlatformOwner(actor);
  const passwordError = validatePassword(input.password);
  if (passwordError) throw new ApiError(ErrorCodes.VALIDATION_ERROR, passwordError, 400);
  const email = normalizeEmail(input.email);
  const now = new Date().toISOString();
  const item = {
    PK: Keys.platformPk(),
    SK: Keys.platformUser(email),
    userId: generateId("plu_"),
    email,
    name: input.name.trim() || email,
    role: input.role ?? "support",
    status: "active",
    passwordHash: await hashPassword(input.password),
    createdAt: now,
    updatedAt: now,
  };
  await getDocClient(config).send(
    new PutCommand({
      TableName: config.tableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(PK)",
    })
  );
  return ok(platformUserDto(item));
}

export async function updatePlatformUser(
  auth: AuthContext,
  emailInput: string,
  patch: { role?: PlatformUserRole; status?: "active" | "disabled"; name?: string },
  config: CoreConfig
) {
  const actor = await assertPlatformAdmin(auth, config);
  assertPlatformOwner(actor);
  const email = normalizeEmail(emailInput);
  const names: Record<string, string> = { "#updatedAt": "updatedAt" };
  const values: Record<string, unknown> = { ":u": new Date().toISOString() };
  const sets = ["#updatedAt = :u"];
  if (patch.role) {
    if (!["owner", "admin", "support"].includes(patch.role)) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Invalid platform role", 400);
    }
    names["#role"] = "role";
    values[":role"] = patch.role;
    sets.push("#role = :role");
  }
  if (patch.status) {
    if (!["active", "disabled"].includes(patch.status)) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Invalid platform status", 400);
    }
    names["#status"] = "status";
    values[":status"] = patch.status;
    sets.push("#status = :status");
  }
  if (patch.name !== undefined) {
    names["#name"] = "name";
    values[":name"] = patch.name.trim() || email;
    sets.push("#name = :name");
  }
  const res = await getDocClient(config).send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.platformPk(), SK: Keys.platformUser(email) },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: "attribute_exists(PK)",
      ReturnValues: "ALL_NEW",
    })
  );
  return ok(platformUserDto(res.Attributes ?? {}));
}

export async function platformLogin(input: { email: string; password: string }, config: CoreConfig) {
  const email = normalizeEmail(input.email);
  const db = getDocClient(config);
  const user = await getPlatformUserByEmail(email, config);
  if (!user || user.status !== "active") {
    throw new ApiError(ErrorCodes.INVALID_CREDENTIALS, "Invalid email or password", 401);
  }
  const valid = await verifyPassword(String(user.passwordHash ?? ""), input.password);
  if (!valid) {
    throw new ApiError(ErrorCodes.INVALID_CREDENTIALS, "Invalid email or password", 401);
  }

  const sessionId = generateId("sess_");
  const refreshToken = randomBytes(32).toString("hex");
  const refreshHash = await hashPassword(refreshToken);
  const refreshLookupHash = tokenHash(refreshToken);
  const sessionTtl = Math.floor(Date.now() / 1000) + config.refreshTokenTtlSec;
  const now = new Date().toISOString();

  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.platformPk(),
        SK: Keys.platformSession(sessionId),
        sessionId,
        userId: user.userId,
        email,
        refreshTokenHash: refreshHash,
        refreshLookupHash,
        scope: "platform",
        createdAt: now,
        expiresAt: sessionTtl,
        ttl: sessionTtl,
        revoked: false,
      },
    })
  );
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.refreshLookupPk(refreshLookupHash),
        SK: Keys.refreshLookupSk(),
        scope: "platform",
        sessionId,
        ttl: sessionTtl,
      },
    })
  );
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.platformPk(), SK: Keys.platformUser(email) },
      UpdateExpression: "SET lastLoginAt = :n, updatedAt = :n",
      ExpressionAttributeValues: { ":n": now },
    })
  );

  const dto = platformUserDto({ ...user, lastLoginAt: now });
  const accessToken = await signAccessToken(
    {
      sub: dto.userId,
      tid: "__platform__",
      role: "owner",
      email,
      mfa: true,
      scope: "platform",
      platformRole: dto.role,
    },
    config
  );
  return ok({
    accessToken,
    refreshToken,
    expiresIn: config.accessTokenTtlSec,
    tokenType: "Bearer",
    user: {
      userId: dto.userId,
      tenantId: "__platform__",
      email: dto.email,
      name: dto.name,
      role: "owner",
      emailVerified: true,
      mfaEnabled: false,
    },
    tenant: {
      tenantId: "__platform__",
      storeName: "CommerceChat Platform",
      plan: "enterprise",
      status: "active",
      timezone: "UTC",
      onboardingStep: "complete",
    },
    platformUser: dto,
  });
}

export async function getPlatformMe(auth: AuthContext, config: CoreConfig) {
  const user = await assertPlatformAdmin(auth, config);
  return ok({ platformUser: user });
}
