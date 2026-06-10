import { createHash, randomBytes } from "crypto";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  ApiError,
  ErrorCodes,
  generateId,
  normalizeEmail,
  ok,
  type AuthContext,
  type User,
  type UserRole,
} from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { issueAuthSession } from "../auth/service";
import { hashPassword, validatePassword } from "../auth/password";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import type { EmailProvider } from "../email/provider";
import { getTenantLimits } from "../tenant/service";

const INVITE_TTL_SEC = 7 * 24 * 60 * 60;

function tokenHash(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function assertCanManageTeam(auth: AuthContext) {
  if (auth.role !== "owner" && auth.role !== "admin") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Insufficient permissions", 403);
  }
}

function assertOwner(auth: AuthContext) {
  if (auth.role !== "owner") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Owner access required", 403);
  }
}

async function getUserRecord(tenantId: string, userId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.user(userId) },
    })
  );
  return res.Item;
}

async function revokeUserSessions(tenantId: string, userId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const sessions = await db.send(
    new QueryCommand({
      TableName: config.tableName,
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
        TableName: config.tableName,
        Key: { PK: session.PK, SK: session.SK },
        UpdateExpression: "SET revoked = :r",
        ExpressionAttributeValues: { ":r": true },
      })
    );
    if (session.refreshLookupHash) {
      await db.send(
        new DeleteCommand({
          TableName: config.tableName,
          Key: {
            PK: Keys.refreshLookupPk(session.refreshLookupHash as string),
            SK: Keys.refreshLookupSk(),
          },
        })
      );
    }
  }
}

async function listUserRecords(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": "USER#",
      },
    })
  );
  return res.Items ?? [];
}

export async function listTeamMembers(auth: AuthContext, config: CoreConfig) {
  const items = await listUserRecords(auth.tenantId, config);
  const members = items.map((u) => ({
    userId: u.userId as string,
    email: u.email as string,
    name: u.name as string,
    role: u.role as UserRole,
    status: (u.status as string) ?? "active",
    lastLoginAt: u.lastLoginAt as string | undefined,
  }));
  return ok({ items: members });
}

export async function inviteTeamMember(
  auth: AuthContext,
  body: { email: string; role: UserRole; name: string },
  config: CoreConfig,
  email: EmailProvider
) {
  assertCanManageTeam(auth);

  const inviteEmail = normalizeEmail(body.email);
  const name = body.name?.trim();
  const role = body.role;

  if (!inviteEmail || !name) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "email and name are required", 400);
  }
  if (role !== "admin" && role !== "viewer") {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "role must be admin or viewer", 400);
  }

  const db = getDocClient(config);
  const existing = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.emailLookupPk(inviteEmail), SK: Keys.emailLookupSk() },
    })
  );
  if (existing.Item) {
    throw new ApiError(ErrorCodes.EMAIL_EXISTS, "Email already registered", 409);
  }

  const limits = await getTenantLimits(auth, config);
  const members = await listUserRecords(auth.tenantId, config);
  if (members.length >= limits.data!.maxTeamMembers) {
    throw new ApiError(ErrorCodes.PLAN_LIMIT_EXCEEDED, "Team member limit reached", 403);
  }

  const inviteId = generateId("inv_");
  const inviteToken = randomBytes(32).toString("hex");
  const inviteHash = tokenHash(inviteToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_SEC * 1000).toISOString();
  const ttl = Math.floor(Date.now() / 1000) + INVITE_TTL_SEC;

  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tokenPk(inviteHash),
        SK: Keys.tokenSk(),
        purpose: "team_invite",
        inviteId,
        tenantId: auth.tenantId,
        email: inviteEmail,
        name,
        role,
        invitedBy: auth.userId,
        used: false,
        expiresAt: ttl,
        ttl,
      },
    })
  );

  await email.sendTeamInvite(inviteEmail, inviteToken, config.appUrl, name);

  return ok({
    inviteId,
    email: inviteEmail,
    role,
    expiresAt,
  });
}

export async function acceptTeamInvite(
  body: { token: string; password: string; name?: string },
  config: CoreConfig
) {
  const passwordError = validatePassword(body.password);
  if (passwordError) throw new ApiError(ErrorCodes.VALIDATION_ERROR, passwordError, 400);

  const rawToken = body.token?.trim();
  if (!rawToken) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "token is required", 400);
  }

  const hash = tokenHash(rawToken);
  const db = getDocClient(config);
  const tokenRes = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tokenPk(hash), SK: Keys.tokenSk() },
    })
  );
  const record = tokenRes.Item;
  if (!record || record.purpose !== "team_invite") {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Invalid or expired invite", 400);
  }
  if (record.used) {
    throw new ApiError(ErrorCodes.INVITE_USED, "Invite already used", 400);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = (record.expiresAt ?? record.ttl) as number;
  if (expiresAt < nowSec) {
    throw new ApiError(ErrorCodes.INVITE_EXPIRED, "Invite expired", 422);
  }

  const tenantId = record.tenantId as string;
  const email = record.email as string;
  const role = record.role as UserRole;
  const displayName = (body.name?.trim() || (record.name as string)?.trim() || "");
  if (!displayName) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "name is required", 400);
  }

  const existing = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.emailLookupPk(email), SK: Keys.emailLookupSk() },
    })
  );
  if (existing.Item) {
    throw new ApiError(ErrorCodes.EMAIL_EXISTS, "Email already registered", 409);
  }

  const limitsRes = await getTenantLimits({ tenantId, userId: "", role: "viewer", email: "" }, config);
  const members = await listUserRecords(tenantId, config);
  if (members.length >= limitsRes.data!.maxTeamMembers) {
    throw new ApiError(ErrorCodes.PLAN_LIMIT_EXCEEDED, "Team member limit reached", 403);
  }

  const userId = generateId("usr_");
  const passwordHash = await hashPassword(body.password);
  const now = new Date().toISOString();

  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: config.tableName,
            Item: {
              PK: Keys.tenantPk(tenantId),
              SK: Keys.user(userId),
              userId,
              tenantId,
              email,
              emailNormalized: email,
              name: displayName,
              passwordHash,
              role,
              status: "active",
              emailVerified: true,
              mfa: { enabled: false, method: "none" },
              failedLoginAttempts: 0,
              createdAt: now,
            },
            ConditionExpression: "attribute_not_exists(SK)",
          },
        },
        {
          Put: {
            TableName: config.tableName,
            Item: { PK: Keys.emailLookupPk(email), SK: Keys.emailLookupSk(), tenantId, userId },
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
        {
          Update: {
            TableName: config.tableName,
            Key: { PK: Keys.tokenPk(hash), SK: Keys.tokenSk() },
            UpdateExpression: "SET used = :u",
            ConditionExpression: "attribute_not_exists(used) OR used = :f",
            ExpressionAttributeValues: { ":u": true, ":f": false },
          },
        },
      ],
    })
  );

  const user: User = {
    userId,
    tenantId,
    email,
    name: displayName,
    role,
    emailVerified: true,
    mfaEnabled: false,
  };

  return issueAuthSession(tenantId, userId, user, config);
}

export async function removeTeamMember(auth: AuthContext, targetUserId: string, config: CoreConfig) {
  assertOwner(auth);

  if (targetUserId === auth.userId) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "You cannot remove yourself", 400);
  }

  const target = await getUserRecord(auth.tenantId, targetUserId, config);
  if (!target) {
    throw new ApiError(ErrorCodes.NOT_FOUND, "Team member not found", 404);
  }
  if (target.role === "owner") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Cannot remove the store owner", 403);
  }

  const email = target.email as string;
  const db = getDocClient(config);

  await revokeUserSessions(auth.tenantId, targetUserId, config);
  await db.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.user(targetUserId) },
    })
  );
  await db.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: { PK: Keys.emailLookupPk(email), SK: Keys.emailLookupSk() },
    })
  );

  return ok({ userId: targetUserId, removed: true });
}

export async function updateTeamMemberRole(
  auth: AuthContext,
  targetUserId: string,
  body: { role: UserRole },
  config: CoreConfig
) {
  assertOwner(auth);

  const role = body.role;
  if (role !== "admin" && role !== "viewer") {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "role must be admin or viewer", 400);
  }

  const target = await getUserRecord(auth.tenantId, targetUserId, config);
  if (!target) {
    throw new ApiError(ErrorCodes.NOT_FOUND, "Team member not found", 404);
  }
  if (target.role === "owner") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Cannot change the owner role", 403);
  }

  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.user(targetUserId) },
      UpdateExpression: "SET #role = :r",
      ExpressionAttributeNames: { "#role": "role" },
      ExpressionAttributeValues: { ":r": role },
    })
  );

  return ok({
    userId: targetUserId,
    role,
    email: target.email as string,
    name: target.name as string,
  });
}
