import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes, ok, type AuthContext, type TenantConfig } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";

export async function getTenantProfile(auth: AuthContext, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.profile() },
    })
  );
  if (!res.Item) throw new ApiError(ErrorCodes.NOT_FOUND, "Tenant not found", 404);
  const p = res.Item;
  return ok({
    tenantId: p.tenantId,
    storeName: p.storeName,
    ownerEmail: p.ownerEmail,
    plan: p.plan,
    status: p.status,
    timezone: p.timezone,
    websiteUrl: p.websiteUrl as string | undefined,
    onboardingStep: p.onboardingStep,
    logoUrl: p.logoUrl,
    createdAt: p.createdAt,
  });
}

export async function updateTenantProfile(
  auth: AuthContext,
  patch: { storeName?: string; timezone?: string; websiteUrl?: string; onboardingStep?: string },
  config: CoreConfig
) {
  const setExpressions: string[] = [];
  const removeExpressions: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ":u": new Date().toISOString() };
  if (patch.storeName) {
    setExpressions.push("#storeName = :s");
    names["#storeName"] = "storeName";
    values[":s"] = patch.storeName;
  }
  if (patch.timezone) {
    setExpressions.push("#timezone = :t");
    names["#timezone"] = "timezone";
    values[":t"] = patch.timezone;
  }
  if (patch.websiteUrl !== undefined) {
    const trimmed = patch.websiteUrl.trim();
    if (trimmed) {
      setExpressions.push("#websiteUrl = :w");
      names["#websiteUrl"] = "websiteUrl";
      values[":w"] = trimmed;
    } else {
      removeExpressions.push("#websiteUrl");
      names["#websiteUrl"] = "websiteUrl";
    }
  }
  if (patch.onboardingStep) {
    setExpressions.push("#onboardingStep = :o");
    names["#onboardingStep"] = "onboardingStep";
    values[":o"] = patch.onboardingStep;
  }
  setExpressions.push("#updatedAt = :u");
  names["#updatedAt"] = "updatedAt";

  const updateParts: string[] = [];
  if (setExpressions.length) updateParts.push(`SET ${setExpressions.join(", ")}`);
  if (removeExpressions.length) updateParts.push(`REMOVE ${removeExpressions.join(", ")}`);

  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.profile() },
      UpdateExpression: updateParts.join(" "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: "attribute_exists(PK)",
    })
  );
  return getTenantProfile(auth, config);
}

export async function getTenantConfig(auth: AuthContext, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.config() },
    })
  );
  if (!res.Item) throw new ApiError(ErrorCodes.NOT_FOUND, "Config not found", 404);
  const { PK: _pk, SK: _sk, ...cfg } = res.Item;
  return ok(cfg as TenantConfig);
}

export async function updateTenantConfig(
  auth: AuthContext,
  patch: Partial<TenantConfig>,
  config: CoreConfig
) {
  const current = await getTenantConfig(auth, config);
  const merged = {
    ...current.data,
    ...patch,
    prompts: { ...current.data!.prompts, ...patch.prompts },
    widgetConfig: { ...current.data!.widgetConfig, ...patch.widgetConfig },
  };
  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.config() },
      UpdateExpression: "SET llmConfig = :l, prompts = :p, enabledChannels = :e, commerceConnector = :c, widgetConfig = :w, featureFlags = :f",
      ExpressionAttributeValues: {
        ":l": merged.llmConfig,
        ":p": merged.prompts,
        ":e": merged.enabledChannels,
        ":c": merged.commerceConnector,
        ":w": merged.widgetConfig,
        ":f": merged.featureFlags,
      },
    })
  );
  return ok(merged);
}

export async function getTenantLimits(auth: AuthContext, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.limits() },
    })
  );
  if (!res.Item) throw new ApiError(ErrorCodes.NOT_FOUND, "Limits not found", 404);
  const { PK: _pk, SK: _sk, ...limits } = res.Item;
  return ok(limits);
}
