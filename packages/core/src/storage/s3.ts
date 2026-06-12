import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { CoreConfig } from "../config";

export function isS3AssetsEnabled(config: CoreConfig) {
  return Boolean(config.s3Bucket);
}

export function getS3Client(config: CoreConfig) {
  if (config.s3Endpoint) {
    return new S3Client({
      region: config.awsRegion,
      endpoint: config.s3Endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.s3AccessKeyId ?? "test",
        secretAccessKey: config.s3SecretAccessKey ?? "test",
      },
    });
  }
  return new S3Client({ region: config.awsRegion });
}

export function s3ObjectPublicUrl(config: CoreConfig, key: string) {
  const base = (config.s3PublicUrl ?? config.s3Endpoint ?? "").replace(/\/$/, "");
  return `${base}/${config.s3Bucket}/${key}`;
}

export function logoObjectKey(tenantId: string, ext: string) {
  return `logos/${tenantId}.${ext}`;
}

export async function presignLogoPut(
  config: CoreConfig,
  key: string,
  contentType: string,
  expiresInSec = 900
) {
  const client = getS3Client(config);
  const command = new PutObjectCommand({
    Bucket: config.s3Bucket!,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSec });
  return { uploadUrl, expiresIn: expiresInSec };
}

export async function putS3Object(
  config: CoreConfig,
  key: string,
  body: Buffer,
  contentType: string
) {
  const client = getS3Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket!,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function s3ObjectExists(config: CoreConfig, key: string) {
  const client = getS3Client(config);
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: config.s3Bucket!,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}
