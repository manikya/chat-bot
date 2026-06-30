import type {
  MobileAiDevicePreferences,
  MobileAiSnapshotChunk,
  MobileAiSnapshotDelta,
  MobileAiSnapshotManifest,
  MobileAiSyncState,
} from "@commercechat/shared/types";
import { EMPTY_MOBILE_AI_SYNC_STATE, manifestToSyncState, snapshotIsFresh } from "./offline-ai";

export interface MobileAiSnapshotStore {
  getState(): Promise<MobileAiSyncState | null>;
  saveState(state: MobileAiSyncState): Promise<void>;
  upsertChunks(chunks: MobileAiSnapshotChunk[]): Promise<void>;
  deleteChunks(ids: string[]): Promise<void>;
}

export interface MobileAiSnapshotApi {
  getSnapshotManifest(): Promise<{ data?: MobileAiSnapshotManifest }>;
  getSnapshotChunks(params?: {
    sinceVersion?: number;
    maxChunks?: number;
  }): Promise<{ data?: MobileAiSnapshotDelta }>;
}

export interface MobileAiSyncResult {
  state: MobileAiSyncState;
  downloadedChunks: number;
  deletedChunks: number;
  skipped: boolean;
}

export async function syncMobileAiSnapshot(
  api: MobileAiSnapshotApi,
  store: MobileAiSnapshotStore,
  options?: { force?: boolean; maxChunks?: number; preferences?: MobileAiDevicePreferences }
): Promise<MobileAiSyncResult> {
  const current = (await store.getState()) ?? EMPTY_MOBILE_AI_SYNC_STATE;
  if (!options?.preferences?.allowVectorSync) {
    return { state: current, downloadedChunks: 0, deletedChunks: 0, skipped: true };
  }

  const manifest = (await api.getSnapshotManifest()).data;
  if (!manifest) {
    const state: MobileAiSyncState = { ...current, status: "error", errorMessage: "Missing snapshot manifest" };
    await store.saveState(state);
    return { state, downloadedChunks: 0, deletedChunks: 0, skipped: false };
  }

  if (!options?.force && current.version === manifest.version && snapshotIsFresh(current)) {
    return { state: current, downloadedChunks: 0, deletedChunks: 0, skipped: true };
  }

  const syncingState: MobileAiSyncState = {
    ...manifestToSyncState(manifest),
    status: "syncing",
  };
  await store.saveState(syncingState);

  try {
    const delta = (
      await api.getSnapshotChunks({
        sinceVersion: current.version,
        maxChunks: options?.maxChunks,
      })
    ).data;
    if (!delta) throw new Error("Missing snapshot delta");

    await store.deleteChunks(delta.deletedChunkIds);
    await store.upsertChunks(delta.chunks);

    const readyState = manifestToSyncState(manifest);
    await store.saveState(readyState);
    return {
      state: readyState,
      downloadedChunks: delta.chunks.length,
      deletedChunks: delta.deletedChunkIds.length,
      skipped: false,
    };
  } catch (error) {
    const state: MobileAiSyncState = {
      ...current,
      status: current.version ? "stale" : "error",
      errorMessage: error instanceof Error ? error.message : "Snapshot sync failed",
    };
    await store.saveState(state);
    return { state, downloadedChunks: 0, deletedChunks: 0, skipped: false };
  }
}
