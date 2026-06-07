import { createHash, randomBytes } from "crypto";
import { TransactWriteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  ApiError,
  ErrorCodes,
  generateId,
  normalizeEmail,
  ok,
  type User,
} from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { defaultPlanLimits, defaultTenantConfig } from "../tenant/defaults";
import type { EmailProvider } from "../email/provider";
import { hashPassword, validatePassword, verifyPassword } from "./password";
import { signAccessToken } from "./jwt";

export interface SignupInput {
  storeName: string;
  email: string;
  password: string;
  name: string;
  timezone: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthDeps {
  config: CoreConfig;
  email: EmailProvider;
}

function tokenHash(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function widgetKeyPair() {
  const raw = `pk_live_${randomBytes(16).toString("hex")}`;
  return { raw, hash: tokenHash(raw), prefix: raw.slice(0, 12) };
}

export async function signup(input: SignupInput, deps: AuthDeps) {
  const passwordError = validatePassword(input.password);
  if (passwordError) throw new ApiError(ErrorCodes.VALIDATION_ERROR, passwordError, 400);

  const email = normalizeEmail(input.email);
  const db = getDocClient(deps.config);
  const now = new Date().toISOString();

  const existing = await db.send(
    new GetCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.emailLookupPk(email), SK: Keys.emailLookupSk() },
    })
  );
  if (existing.Item) throw new ApiError(ErrorCodes.EMAIL_EXISTS, "Email already registered", 409);

  const tenantId = generateId("ten_");
  const userId = generateId("usr_");
  const passwordHash = await hashPassword(input.password);
  const verifyToken = randomBytes(32).toString("hex");
  const verifyHash = tokenHash(verifyToken);
  const widget = widgetKeyPair();
  const ttl = Math.floor(Date.now() / 1000) + 86400;

  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: deps.config.tableName,
            Item: {
              PK: Keys.tenantPk(tenantId),
              SK: Keys.profile(),
              tenantId,
              storeName: input.storeName,
              ownerEmail: email,
              plan: "trial",
              status: "trial",
              timezone: input.timezone,
              onboardingStep: "profile",
              widgetApiKeyPrefix: widget.prefix,
              createdAt: now,
              updatedAt: now,
            },
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
        {
          Put: {
            TableName: deps.config.tableName,
            Item: {
              PK: Keys.tenantPk(tenantId),
              SK: Keys.config(),
              ...defaultTenantConfig(input.storeName),
            },
          },
        },
        {
          Put: {
            TableName: deps.config.tableName,
            Item: { PK: Keys.tenantPk(tenantId), SK: Keys.limits(), ...defaultPlanLimits() },
          },
        },
        {
          Put: {
            TableName: deps.config.tableName,
            Item: {
              PK: Keys.tenantPk(tenantId),
              SK: Keys.user(userId),
              userId,
              tenantId,
              email,
              emailNormalized: email,
              name: input.name,
              passwordHash,
              role: "owner",
              status: "active",
              emailVerified: false,
              mfa: { enabled: false, method: "none" },
              failedLoginAttempts: 0,
              createdAt: now,
            },
          },
        },
        {
          Put: {
            TableName: deps.config.tableName,
            Item: { PK: Keys.emailLookupPk(email), SK: Keys.emailLookupSk(), tenantId, userId },
          },
        },
        {
          Put: {
            TableName: deps.config.tableName,
            Item: {
              PK: Keys.tokenPk(verifyHash),
              SK: Keys.tokenSk(),
              purpose: "email_verify",
              tenantId,
              userId,
              email,
              used: false,
              ttl,
              expiresAt: ttl,
            },
          },
        },
        {
          Put: {
            TableName: deps.config.tableName,
            Item: { PK: Keys.apiKeyPk(widget.hash), SK: Keys.apiKeySk(), tenantId },
          },
        },
      ],
    })
  );

  await deps.email.sendVerifyEmail(email, verifyToken, deps.config.appUrl);

  return ok(
    {
      tenantId,
      userId,
      email,
      emailVerified: false,
      onboardingStep: "profile" as const,
    },
    "Account created. Please verify your email."
  );
}

export async function login(input: LoginInput, deps: AuthDeps) {
  const email = normalizeEmail(input.email);
  const db = getDocClient(deps.config);

  const lookup = await db.send(
    new GetCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.emailLookupPk(email), SK: Keys.emailLookupSk() },
    })
  );
  if (!lookup.Item) throw new ApiError(ErrorCodes.INVALID_CREDENTIALS, "Invalid email or password", 401);

  const { tenantId, userId } = lookup.Item as { tenantId: string; userId: string };
  const userRes = await db.send(
    new GetCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.user(userId) },
    })
  );
  const userRecord = userRes.Item;
  if (!userRecord) throw new ApiError(ErrorCodes.INVALID_CREDENTIALS, "Invalid email or password", 401);

  if (userRecord.lockedUntil && new Date(userRecord.lockedUntil) > new Date()) {
    throw new ApiError(ErrorCodes.ACCOUNT_LOCKED, "Account temporarily locked", 403);
  }

  const valid = await verifyPassword(userRecord.passwordHash as string, input.password);
  if (!valid) {
    const attempts = (userRecord.failedLoginAttempts as number) + 1;
    const updates: Record<string, unknown> = { failedLoginAttempts: attempts };
    if (attempts >= 5) {
      updates.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }
    await db.send(
      new UpdateCommand({
        TableName: deps.config.tableName,
        Key: { PK: Keys.tenantPk(tenantId), SK: Keys.user(userId) },
        UpdateExpression: "SET failedLoginAttempts = :a" + (updates.lockedUntil ? ", lockedUntil = :l" : ""),
        ExpressionAttributeValues: {
          ":a": attempts,
          ...(updates.lockedUntil ? { ":l": updates.lockedUntil } : {}),
        },
      })
    );
    throw new ApiError(ErrorCodes.INVALID_CREDENTIALS, "Invalid email or password", 401);
  }

  if (!userRecord.emailVerified) {
    throw new ApiError(ErrorCodes.EMAIL_NOT_VERIFIED, "Please verify your email first", 403);
  }

  const profileRes = await db.send(
    new GetCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() },
    })
  );

  const sessionId = generateId("sess_");
  const refreshToken = randomBytes(32).toString("hex");
  const refreshHash = await hashPassword(refreshToken);
  const sessionTtl = Math.floor(Date.now() / 1000) + deps.config.refreshTokenTtlSec;

  await db.send(
    new PutCommand({
      TableName: deps.config.tableName,
      Item: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.session(sessionId),
        sessionId,
        userId,
        refreshTokenHash: refreshHash,
        mfaVerified: true,
        createdAt: new Date().toISOString(),
        expiresAt: sessionTtl,
        ttl: sessionTtl,
        revoked: false,
      },
    })
  );

  await db.send(
    new UpdateCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.user(userId) },
      UpdateExpression: "SET failedLoginAttempts = :z, lastLoginAt = :n REMOVE lockedUntil",
      ExpressionAttributeValues: { ":z": 0, ":n": new Date().toISOString() },
    })
  );

  const user: User = {
    userId,
    tenantId,
    email,
    name: userRecord.name as string,
    role: userRecord.role as User["role"],
    emailVerified: true,
    mfaEnabled: Boolean(userRecord.mfa?.enabled),
  };

  const profile = profileRes.Item!;
  const accessToken = await signAccessToken(
    { sub: userId, tid: tenantId, role: user.role, email, mfa: true },
    deps.config
  );

  return ok({
    accessToken,
    refreshToken,
    expiresIn: deps.config.accessTokenTtlSec,
    tokenType: "Bearer",
    user,
    tenant: {
      tenantId,
      storeName: profile.storeName,
      plan: profile.plan,
      status: profile.status,
      timezone: profile.timezone,
      onboardingStep: profile.onboardingStep,
      logoUrl: profile.logoUrl,
    },
  });
}

export async function verifyEmail(token: string, deps: AuthDeps) {
  const hash = tokenHash(token);
  const db = getDocClient(deps.config);
  const tokenRes = await db.send(
    new GetCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.tokenPk(hash), SK: Keys.tokenSk() },
    })
  );
  const record = tokenRes.Item;
  if (!record || record.used || record.purpose !== "email_verify") {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Invalid or expired token", 400);
  }

  await db.send(
    new UpdateCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.tenantPk(record.tenantId), SK: Keys.user(record.userId) },
      UpdateExpression: "SET emailVerified = :v",
      ExpressionAttributeValues: { ":v": true },
    })
  );
  await db.send(
    new UpdateCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.tokenPk(hash), SK: Keys.tokenSk() },
      UpdateExpression: "SET used = :u",
      ExpressionAttributeValues: { ":u": true },
    })
  );

  return ok({ emailVerified: true });
}

export async function getMe(auth: { tenantId: string; userId: string }, deps: AuthDeps) {
  const db = getDocClient(deps.config);
  const [userRes, profileRes] = await Promise.all([
    db.send(
      new GetCommand({
        TableName: deps.config.tableName,
        Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.user(auth.userId) },
      })
    ),
    db.send(
      new GetCommand({
        TableName: deps.config.tableName,
        Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.profile() },
      })
    ),
  ]);

  if (!userRes.Item || !profileRes.Item) {
    throw new ApiError(ErrorCodes.NOT_FOUND, "User not found", 404);
  }

  const u = userRes.Item;
  const p = profileRes.Item;

  return ok({
    user: {
      userId: u.userId,
      tenantId: u.tenantId,
      email: u.email,
      name: u.name,
      role: u.role,
      emailVerified: u.emailVerified,
      mfaEnabled: Boolean(u.mfa?.enabled),
    },
    tenant: {
      tenantId: p.tenantId,
      storeName: p.storeName,
      plan: p.plan,
      status: p.status,
      timezone: p.timezone,
      onboardingStep: p.onboardingStep,
      logoUrl: p.logoUrl,
    },
  });
}
