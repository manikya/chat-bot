import { createHash, randomBytes } from "crypto";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  ApiError,
  ErrorCodes,
  generateId,
  normalizeEmail,
  ok,
  type AuthContext,
  type UserRole,
} from "@commercechat/shared";
import type { CoreConfig } from "../config";
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
