import { S3VectorsClient } from "@aws-sdk/client-s3vectors";
import type { CoreConfig } from "../../config";

export function createS3VectorsClient(config: CoreConfig): S3VectorsClient {
  const credentials =
    config.s3VectorsAccessKeyId && config.s3VectorsSecretAccessKey
      ? {
          accessKeyId: config.s3VectorsAccessKeyId,
          secretAccessKey: config.s3VectorsSecretAccessKey,
        }
      : undefined;

  return new S3VectorsClient({
    region: config.awsRegion,
    ...(config.s3VectorsEndpoint ? { endpoint: config.s3VectorsEndpoint } : {}),
    ...(credentials ? { credentials } : {}),
  });
}

export function tenantIndexName(tenantId: string): string {
  const safe = tenantId.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `tenant-${safe}`;
}
