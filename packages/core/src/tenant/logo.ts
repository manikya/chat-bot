import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes, ok, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/webp", "webp"],
]);

function assertCanUploadLogo(auth: AuthContext) {
  if (auth.role !== "owner" && auth.role !== "admin") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Insufficient permissions", 403);
  }
}

export function logoAssetPath(config: CoreConfig, tenantId: string, ext: string) {
  return join(config.dataDir, "assets", "logos", `${tenantId}.${ext}`);
}

export function logoPublicUrl(config: CoreConfig, tenantId: string, ext: string) {
  return `${config.apiPublicUrl.replace(/\/$/, "")}/assets/logos/${tenantId}.${ext}`;
}

export async function uploadTenantLogo(
  auth: AuthContext,
  file: { data: Buffer; contentType?: string },
  config: CoreConfig
) {
  assertCanUploadLogo(auth);

  if (!file.data.length) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Logo file is required", 400);
  }
  if (file.data.length > MAX_LOGO_BYTES) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Logo must be 2 MB or smaller", 400);
  }

  const contentType = file.contentType?.toLowerCase() ?? "";
  const ext = ALLOWED_TYPES.get(contentType);
  if (!ext) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Logo must be PNG, JPG, or WebP", 400);
  }

  const path = logoAssetPath(config, auth.tenantId, ext);
  await mkdir(join(config.dataDir, "assets", "logos"), { recursive: true });
  await writeFile(path, file.data);

  const logoUrl = logoPublicUrl(config, auth.tenantId, ext);
  const updatedAt = new Date().toISOString();

  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.profile() },
      UpdateExpression: "SET logoUrl = :l, updatedAt = :u",
      ExpressionAttributeValues: { ":l": logoUrl, ":u": updatedAt },
      ConditionExpression: "attribute_exists(PK)",
    })
  );

  return ok({ logoUrl, updatedAt });
}
