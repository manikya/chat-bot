import type { CoreConfig } from "../../config";
import { FileVectorStore } from "./file-store";
import type { VectorStore } from "./store";

export function createVectorStore(config: CoreConfig): VectorStore {
  return new FileVectorStore(config.dataDir);
}

export type { VectorStore, VectorQueryOptions } from "./store";
