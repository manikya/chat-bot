import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";

export const TENANT_SUSPENDED_MESSAGE =
  "This store's CommerceChat account is inactive. Please contact the store or upgrade your plan.";

export function isTenantInactiveError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    err.code === ErrorCodes.FORBIDDEN &&
    (err.message === TENANT_SUSPENDED_MESSAGE || err.message.includes("not active"))
  );
}

export async function getTenantProfileRaw(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() },
    })
  );
  if (!res.Item) throw new ApiError(ErrorCodes.NOT_FOUND, "Tenant not found", 404);
  return res.Item;
}

export async function expireTrialIfNeeded(
  tenantId: string,
  profile: Record<string, unknown>,
  config: CoreConfig
) {
  if (profile.plan !== "trial" || profile.status !== "trial") return profile;

  const periodEnd = profile.billingPeriodEnd as string | undefined;
  if (!periodEnd || new Date(periodEnd).getTime() > Date.now()) return profile;

  const now = new Date().toISOString();
  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() },
      UpdateExpression: "SET #status = :s, updatedAt = :u",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":s": "suspended", ":u": now },
    })
  );

  return { ...profile, status: "suspended" };
}

export async function resolveTenantProfile(tenantId: string, config: CoreConfig) {
  const profile = await getTenantProfileRaw(tenantId, config);
  return expireTrialIfNeeded(tenantId, profile, config);
}

export async function assertTenantOperational(tenantId: string, config: CoreConfig) {
  const profile = await resolveTenantProfile(tenantId, config);
  const status = profile.status as string;

  if (status === "suspended") {
    throw new ApiError(ErrorCodes.FORBIDDEN, TENANT_SUSPENDED_MESSAGE, 403);
  }
  if (status !== "active" && status !== "trial") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Tenant account is not active", 403);
  }

  return profile;
}

export function tenantIsOperational(status: string) {
  return status === "active" || status === "trial";
}
