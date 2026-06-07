import { createHash, randomBytes } from "crypto";
import {
  TransactWriteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
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
        refreshLookupHash: tokenHash(refreshToken),
        mfaVerified: true,
        createdAt: new Date().toISOString(),
        expiresAt: sessionTtl,
        ttl: sessionTtl,
        revoked: false,
      },
    })
  );

  await db.send(
    new PutCommand({
      TableName: deps.config.tableName,
      Item: {
        PK: Keys.refreshLookupPk(tokenHash(refreshToken)),
        SK: Keys.refreshLookupSk(),
        tenantId,
        sessionId,
        ttl: sessionTtl,
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

async function resolveRefreshSession(refreshToken: string, deps: AuthDeps) {
  if (!refreshToken) {
    throw new ApiError(ErrorCodes.UNAUTHORIZED, "Invalid refresh token", 401);
  }

  const db = getDocClient(deps.config);
  const lookupHash = tokenHash(refreshToken);
  const lookup = await db.send(
    new GetCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.refreshLookupPk(lookupHash), SK: Keys.refreshLookupSk() },
    })
  );
  if (!lookup.Item) {
    throw new ApiError(ErrorCodes.UNAUTHORIZED, "Invalid refresh token", 401);
  }

  const { tenantId, sessionId } = lookup.Item as { tenantId: string; sessionId: string };
  const sessionRes = await db.send(
    new GetCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.session(sessionId) },
    })
  );
  const session = sessionRes.Item;
  if (!session || session.revoked) {
    throw new ApiError(ErrorCodes.UNAUTHORIZED, "Session revoked", 401);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if ((session.expiresAt as number) < nowSec) {
    throw new ApiError(ErrorCodes.TOKEN_EXPIRED, "Refresh token expired", 401);
  }

  const valid = await verifyPassword(session.refreshTokenHash as string, refreshToken);
  if (!valid) {
    throw new ApiError(ErrorCodes.UNAUTHORIZED, "Invalid refresh token", 401);
  }

  return { tenantId, sessionId, session, lookupHash };
}

export async function refreshAccessToken(refreshToken: string, deps: AuthDeps) {
  const { tenantId, session } = await resolveRefreshSession(refreshToken, deps);
  const db = getDocClient(deps.config);

  const userRes = await db.send(
    new GetCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.user(session.userId as string) },
    })
  );
  const userRecord = userRes.Item;
  if (!userRecord || userRecord.status !== "active") {
    throw new ApiError(ErrorCodes.UNAUTHORIZED, "Invalid refresh token", 401);
  }

  const accessToken = await signAccessToken(
    {
      sub: userRecord.userId as string,
      tid: tenantId,
      role: userRecord.role as User["role"],
      email: userRecord.email as string,
      mfa: true,
    },
    deps.config
  );

  return ok({
    accessToken,
    expiresIn: deps.config.accessTokenTtlSec,
    tokenType: "Bearer",
  });
}

export async function logout(refreshToken: string, deps: AuthDeps) {
  const { tenantId, sessionId, lookupHash } = await resolveRefreshSession(refreshToken, deps);
  const db = getDocClient(deps.config);

  await db.send(
    new UpdateCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.session(sessionId) },
      UpdateExpression: "SET revoked = :r",
      ExpressionAttributeValues: { ":r": true },
    })
  );
  await db.send(
    new DeleteCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.refreshLookupPk(lookupHash), SK: Keys.refreshLookupSk() },
    })
  );

  return ok({ loggedOut: true });
}

export async function forgotPassword(email: string, deps: AuthDeps) {
  const normalized = normalizeEmail(email);
  const db = getDocClient(deps.config);

  const lookup = await db.send(
    new GetCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.emailLookupPk(normalized), SK: Keys.emailLookupSk() },
    })
  );

  if (lookup.Item) {
    const { tenantId, userId } = lookup.Item as { tenantId: string; userId: string };
    const resetToken = randomBytes(32).toString("hex");
    const resetHash = tokenHash(resetToken);
    const ttl = Math.floor(Date.now() / 1000) + 3600;

    await db.send(
      new PutCommand({
        TableName: deps.config.tableName,
        Item: {
          PK: Keys.tokenPk(resetHash),
          SK: Keys.tokenSk(),
          purpose: "password_reset",
          tenantId,
          userId,
          email: normalized,
          used: false,
          ttl,
          expiresAt: ttl,
        },
      })
    );

    await deps.email.sendPasswordReset(normalized, resetToken, deps.config.appUrl);
  }

  return ok(
    undefined,
    "If that email exists, a reset link has been sent."
  );
}

export async function resetPassword(token: string, password: string, deps: AuthDeps) {
  const passwordError = validatePassword(password);
  if (passwordError) throw new ApiError(ErrorCodes.VALIDATION_ERROR, passwordError, 400);

  const hash = tokenHash(token);
  const db = getDocClient(deps.config);
  const tokenRes = await db.send(
    new GetCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.tokenPk(hash), SK: Keys.tokenSk() },
    })
  );
  const record = tokenRes.Item;
  if (!record || record.used || record.purpose !== "password_reset") {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Invalid or expired token", 400);
  }

  const passwordHash = await hashPassword(password);
  const { tenantId, userId } = record as { tenantId: string; userId: string };

  await db.send(
    new UpdateCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.user(userId) },
      UpdateExpression:
        "SET passwordHash = :p, failedLoginAttempts = :z REMOVE lockedUntil",
      ExpressionAttributeValues: { ":p": passwordHash, ":z": 0 },
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

  const sessions = await db.send(
    new QueryCommand({
      TableName: deps.config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": "SESSION#",
      },
    })
  );

  for (const session of sessions.Items ?? []) {
    if (session.userId !== userId || session.revoked) continue;
    await db.send(
      new UpdateCommand({
        TableName: deps.config.tableName,
        Key: { PK: session.PK, SK: session.SK },
        UpdateExpression: "SET revoked = :r",
        ExpressionAttributeValues: { ":r": true },
      })
    );
    if (session.refreshLookupHash) {
      await db.send(
        new DeleteCommand({
          TableName: deps.config.tableName,
          Key: {
            PK: Keys.refreshLookupPk(session.refreshLookupHash as string),
            SK: Keys.refreshLookupSk(),
          },
        })
      );
    }
  }

  return ok(undefined, "Password updated successfully.");
}

export async function resendVerification(email: string, deps: AuthDeps) {
  const normalized = normalizeEmail(email);
  const db = getDocClient(deps.config);

  const lookup = await db.send(
    new GetCommand({
      TableName: deps.config.tableName,
      Key: { PK: Keys.emailLookupPk(normalized), SK: Keys.emailLookupSk() },
    })
  );

  if (lookup.Item) {
    const { tenantId, userId } = lookup.Item as { tenantId: string; userId: string };
    const userRes = await db.send(
      new GetCommand({
        TableName: deps.config.tableName,
        Key: { PK: Keys.tenantPk(tenantId), SK: Keys.user(userId) },
      })
    );
    const user = userRes.Item;
    if (user && !user.emailVerified) {
      const verifyToken = randomBytes(32).toString("hex");
      const verifyHash = tokenHash(verifyToken);
      const ttl = Math.floor(Date.now() / 1000) + 86400;

      await db.send(
        new PutCommand({
          TableName: deps.config.tableName,
          Item: {
            PK: Keys.tokenPk(verifyHash),
            SK: Keys.tokenSk(),
            purpose: "email_verify",
            tenantId,
            userId,
            email: normalized,
            used: false,
            ttl,
            expiresAt: ttl,
          },
        })
      );

      await deps.email.sendVerifyEmail(normalized, verifyToken, deps.config.appUrl);
    }
  }

  return ok(
    undefined,
    "If that email is unverified, a new link has been sent."
  );
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
