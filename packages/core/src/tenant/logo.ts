import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes, ok, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import {
  isS3AssetsEnabled,
  logoObjectKey,
  presignLogoPut,
  putS3Object,
  s3ObjectExists,
  s3ObjectPublicUrl,
} from "../storage/s3";

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

function resolveLogoExt(contentType: string) {
  const ext = ALLOWED_TYPES.get(contentType.toLowerCase());
  if (!ext) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Logo must be PNG, JPG, or WebP", 400);
  }
  return ext;
}

export function logoAssetPath(config: CoreConfig, tenantId: string, ext: string) {
  return join(config.dataDir, "assets", "logos", `${tenantId}.${ext}`);
}

export function logoPublicUrl(config: CoreConfig, tenantId: string, ext: string) {
  if (isS3AssetsEnabled(config)) {
    return s3ObjectPublicUrl(config, logoObjectKey(tenantId, ext));
  }
  return `${config.apiPublicUrl.replace(/\/$/, "")}/assets/logos/${tenantId}.${ext}`;
}

async function saveLogoUrl(auth: AuthContext, logoUrl: string, config: CoreConfig) {
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

export async function presignTenantLogoUpload(
  auth: AuthContext,
  body: { contentType: string },
  config: CoreConfig
) {
  assertCanUploadLogo(auth);
  if (!isS3AssetsEnabled(config)) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "S3 logo upload is not configured", 400);
  }

  const contentType = body.contentType?.toLowerCase() ?? "";
  const ext = resolveLogoExt(contentType);
  const key = logoObjectKey(auth.tenantId, ext);
  const { uploadUrl, expiresIn } = await presignLogoPut(config, key, contentType);
  const logoUrl = s3ObjectPublicUrl(config, key);

  return ok({ uploadUrl, logoUrl, key, contentType, expiresIn });
}

export async function completeTenantLogoUpload(
  auth: AuthContext,
  body: { key: string },
  config: CoreConfig
) {
  assertCanUploadLogo(auth);
  if (!isS3AssetsEnabled(config)) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "S3 logo upload is not configured", 400);
  }

  const key = body.key?.trim();
  if (!key) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "key is required", 400);
  }

  const expectedPrefix = `logos/${auth.tenantId}.`;
  if (!key.startsWith(expectedPrefix)) {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Invalid logo key for this tenant", 403);
  }

  const exists = await s3ObjectExists(config, key);
  if (!exists) {
    throw new ApiError(ErrorCodes.NOT_FOUND, "Logo upload not found — complete the PUT upload first", 404);
  }

  const logoUrl = s3ObjectPublicUrl(config, key);
  return saveLogoUrl(auth, logoUrl, config);
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
  const ext = resolveLogoExt(contentType);

  if (isS3AssetsEnabled(config)) {
    const key = logoObjectKey(auth.tenantId, ext);
    await putS3Object(config, key, file.data, contentType);
    const logoUrl = s3ObjectPublicUrl(config, key);
    return saveLogoUrl(auth, logoUrl, config);
  }

  const path = logoAssetPath(config, auth.tenantId, ext);
  await mkdir(join(config.dataDir, "assets", "logos"), { recursive: true });
  await writeFile(path, file.data);

  const logoUrl = logoPublicUrl(config, auth.tenantId, ext);
  return saveLogoUrl(auth, logoUrl, config);
}
