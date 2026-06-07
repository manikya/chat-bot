import { createHash, randomBytes } from "crypto";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes, ok, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";

export function hashApiKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function widgetKeyPair() {
  const raw = `pk_live_${randomBytes(16).toString("hex")}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 12) };
}

export async function verifyWidgetApiKey(apiKey: string, config: CoreConfig): Promise<string> {
  if (!apiKey?.startsWith("pk_live_")) {
    throw new ApiError(ErrorCodes.UNAUTHORIZED, "Invalid API key", 401);
  }
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.apiKeyPk(hashApiKey(apiKey)), SK: Keys.apiKeySk() },
    })
  );
  if (!res.Item?.tenantId) {
    throw new ApiError(ErrorCodes.UNAUTHORIZED, "Invalid API key", 401);
  }
  return res.Item.tenantId as string;
}

export async function regenerateWidgetApiKey(auth: AuthContext, config: CoreConfig) {
  if (auth.role !== "owner" && auth.role !== "admin") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Only owners and admins can regenerate API keys", 403);
  }

  const widget = widgetKeyPair();
  const now = new Date().toISOString();
  const db = getDocClient(config);

  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: { PK: Keys.apiKeyPk(widget.hash), SK: Keys.apiKeySk(), tenantId: auth.tenantId, createdAt: now },
    })
  );

  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.profile() },
      UpdateExpression: "SET widgetApiKeyPrefix = :p, updatedAt = :u",
      ExpressionAttributeValues: { ":p": widget.prefix, ":u": now },
      ConditionExpression: "attribute_exists(PK)",
    })
  );

  return ok({
    apiKey: widget.raw,
    prefix: widget.prefix,
    createdAt: now,
  });
}
