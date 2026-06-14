import type { CoreConfig } from "../../config";
import { S3VectorStore } from "./s3-vector-store";
import type { VectorStore } from "./store";

export function createVectorStore(config: CoreConfig): VectorStore {
  return new S3VectorStore(config);
}

export type { VectorStore, VectorQueryOptions } from "./store";
export { tenantIndexName } from "./s3-client";
