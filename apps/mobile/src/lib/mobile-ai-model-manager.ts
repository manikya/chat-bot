import * as FileSystem from "expo-file-system/legacy";
import type { MobileAiDevicePreferences } from "@commercechat/shared/types";
import {
  loadMobileAiPreferences,
  patchMobileAiPreferences,
  saveMobileAiPreferences,
} from "./offline-ai-preferences";

const MODEL_DIR = `${FileSystem.documentDirectory ?? ""}mobile-ai-models/`;
const DEFAULT_MODEL_ID = process.env.EXPO_PUBLIC_LOCAL_LLM_MODEL_ID ?? "gemma-local";
const DEFAULT_MODEL_VERSION = process.env.EXPO_PUBLIC_LOCAL_LLM_MODEL_VERSION ?? "pending";
const DEFAULT_MODEL_DISPLAY_NAME =
  process.env.EXPO_PUBLIC_LOCAL_LLM_MODEL_NAME ?? "Gemma local model";
const DEFAULT_MODEL_FILE_NAME =
  process.env.EXPO_PUBLIC_LOCAL_LLM_MODEL_FILE_NAME ?? `${DEFAULT_MODEL_ID}-${DEFAULT_MODEL_VERSION}.task`;
const DEFAULT_MODEL_DOWNLOAD_URL = process.env.EXPO_PUBLIC_LOCAL_LLM_MODEL_URL;
const DEFAULT_MODEL_SIZE_BYTES = Number(process.env.EXPO_PUBLIC_LOCAL_LLM_MODEL_SIZE_BYTES ?? 0) || undefined;
const DEFAULT_MODEL_MD5 = process.env.EXPO_PUBLIC_LOCAL_LLM_MODEL_MD5;
const DEFAULT_MODEL_MANIFEST_URL =
  process.env.EXPO_PUBLIC_LOCAL_LLM_MANIFEST_URL ??
  "https://d3g8dfkodwqrza.cloudfront.net/mobile-llm-release.json";

let activeDownload: FileSystem.DownloadResumable | null = null;

export interface MobileAiModelManifest {
  id: string;
  version: string;
  displayName: string;
  fileName: string;
  downloadUrl?: string;
  sizeBytes?: number;
  md5?: string;
}

function normalizeRemoteManifest(value: Partial<MobileAiModelManifest>): MobileAiModelManifest {
  const fallback = getConfiguredMobileAiModel();
  return {
    id: value.id || fallback.id,
    version: value.version || fallback.version,
    displayName: value.displayName || fallback.displayName,
    fileName: value.fileName || fallback.fileName,
    downloadUrl: value.downloadUrl || fallback.downloadUrl,
    sizeBytes:
      typeof value.sizeBytes === "number" && value.sizeBytes > 0
        ? value.sizeBytes
        : fallback.sizeBytes,
    md5: value.md5 || fallback.md5,
  };
}

export function getConfiguredMobileAiModel(): MobileAiModelManifest {
  return {
    id: DEFAULT_MODEL_ID,
    version: DEFAULT_MODEL_VERSION,
    displayName: DEFAULT_MODEL_DISPLAY_NAME,
    fileName: DEFAULT_MODEL_FILE_NAME,
    downloadUrl: DEFAULT_MODEL_DOWNLOAD_URL,
    sizeBytes: DEFAULT_MODEL_SIZE_BYTES,
    md5: DEFAULT_MODEL_MD5,
  };
}

export async function loadConfiguredMobileAiModel(): Promise<MobileAiModelManifest> {
  if (!DEFAULT_MODEL_MANIFEST_URL) return getConfiguredMobileAiModel();
  try {
    const response = await fetch(DEFAULT_MODEL_MANIFEST_URL, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return getConfiguredMobileAiModel();
    return normalizeRemoteManifest((await response.json()) as Partial<MobileAiModelManifest>);
  } catch {
    return getConfiguredMobileAiModel();
  }
}

export function isMobileAiModelConfigured(
  manifest = getConfiguredMobileAiModel()
): boolean {
  return Boolean(manifest.downloadUrl);
}

export function formatModelBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "Unknown";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function modelUri(fileName: string): string {
  return `${MODEL_DIR}${fileName}`;
}

async function ensureModelDir(): Promise<void> {
  if (!FileSystem.documentDirectory) {
    throw new Error("Device file storage is unavailable.");
  }
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
}

function progressPatch(
  prefs: MobileAiDevicePreferences,
  totalBytesWritten: number,
  totalBytesExpectedToWrite: number
): Partial<MobileAiDevicePreferences> {
  const modelSizeBytes = totalBytesExpectedToWrite || prefs.modelSizeBytes;
  const modelDownloadProgressPct = modelSizeBytes
    ? Math.min(100, Math.round((totalBytesWritten / modelSizeBytes) * 100))
    : prefs.modelDownloadProgressPct;
  return {
    modelStatus: "downloading",
    modelDownloadedBytes: totalBytesWritten,
    modelSizeBytes,
    modelDownloadProgressPct,
    modelErrorMessage: undefined,
  };
}

async function markDownloadComplete(
  prefs: MobileAiDevicePreferences,
  manifest: MobileAiModelManifest,
  uri: string,
  md5?: string
): Promise<MobileAiDevicePreferences> {
  const info = await FileSystem.getInfoAsync(uri);
  const downloadedBytes = info.exists && "size" in info ? info.size : prefs.modelSizeBytes;
  if (manifest.sizeBytes && downloadedBytes && downloadedBytes < manifest.sizeBytes) {
    throw new Error("Model download finished early. Please retry the download.");
  }
  if (manifest.md5) {
    if (!md5 || manifest.md5.toLowerCase() !== md5.toLowerCase()) {
      throw new Error("Model checksum verification failed. Please retry the download.");
    }
  }
  return patchMobileAiPreferences({
    modelStatus: "ready",
    modelId: manifest.id,
    modelVersion: manifest.version,
    modelDisplayName: manifest.displayName,
    modelDownloadUrl: manifest.downloadUrl,
    modelLocalUri: uri,
    modelSizeBytes: manifest.sizeBytes ?? downloadedBytes,
    modelDownloadedBytes: downloadedBytes,
    modelDownloadProgressPct: 100,
    modelResumeData: undefined,
    modelAvailableVersion: undefined,
    modelChecksum: md5,
    modelDownloadedAt: new Date().toISOString(),
    modelErrorMessage: undefined,
  });
}

async function runDownload(
  manifest: MobileAiModelManifest,
  existingResumeData?: string,
  onProgress?: (preferences: MobileAiDevicePreferences) => void
): Promise<MobileAiDevicePreferences> {
  const prefs = await loadMobileAiPreferences();
  if (!prefs.allowLlmDownload) {
    throw new Error("Local LLM downloads are disabled on this phone.");
  }
  if (!manifest.downloadUrl) {
    return patchMobileAiPreferences({
      modelStatus: "download_pending",
      modelId: manifest.id,
      modelVersion: manifest.version,
      modelDisplayName: manifest.displayName,
      modelSizeBytes: manifest.sizeBytes,
      modelDownloadProgressPct: 0,
      modelErrorMessage:
        "No local model artifact is configured for this app build yet. Upload the Gemma model and rebuild with EXPO_PUBLIC_LOCAL_LLM_MODEL_URL.",
    });
  }

  await ensureModelDir();
  const uri = modelUri(manifest.fileName);
  await patchMobileAiPreferences({
    modelStatus: "downloading",
    modelId: manifest.id,
    modelVersion: manifest.version,
    modelDisplayName: manifest.displayName,
    modelDownloadUrl: manifest.downloadUrl,
    modelLocalUri: uri,
    modelSizeBytes: manifest.sizeBytes,
    modelErrorMessage: undefined,
  });

  activeDownload = FileSystem.createDownloadResumable(
    manifest.downloadUrl,
    uri,
    { md5: Boolean(manifest.md5) },
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      void patchMobileAiPreferences(
        progressPatch(prefs, totalBytesWritten, totalBytesExpectedToWrite)
      ).then(onProgress);
    },
    existingResumeData
  );

  try {
    const result = existingResumeData
      ? await activeDownload.resumeAsync()
      : await activeDownload.downloadAsync();
    if (!result) {
      return patchMobileAiPreferences({ modelStatus: "paused" });
    }
    return await markDownloadComplete(prefs, manifest, result.uri, result.md5);
  } catch (e) {
    return patchMobileAiPreferences({
      modelStatus: "error",
      modelErrorMessage: (e as { message?: string }).message ?? "Model download failed.",
    });
  } finally {
    activeDownload = null;
  }
}

export async function startMobileAiModelDownload(
  onProgress?: (preferences: MobileAiDevicePreferences) => void
): Promise<MobileAiDevicePreferences> {
  return runDownload(await loadConfiguredMobileAiModel(), undefined, onProgress);
}

export async function resumeMobileAiModelDownload(
  onProgress?: (preferences: MobileAiDevicePreferences) => void
): Promise<MobileAiDevicePreferences> {
  const prefs = await loadMobileAiPreferences();
  return runDownload(await loadConfiguredMobileAiModel(), prefs.modelResumeData, onProgress);
}

export async function pauseMobileAiModelDownload(): Promise<MobileAiDevicePreferences> {
  if (!activeDownload) {
    return patchMobileAiPreferences({ modelStatus: "paused" });
  }
  const pauseState = await activeDownload.pauseAsync();
  activeDownload = null;
  return patchMobileAiPreferences({
    modelStatus: "paused",
    modelResumeData: pauseState.resumeData,
  });
}

export async function removeMobileAiModel(): Promise<MobileAiDevicePreferences> {
  const prefs = await patchMobileAiPreferences({ modelStatus: "removing" });
  if (prefs.modelLocalUri) {
    await FileSystem.deleteAsync(prefs.modelLocalUri, { idempotent: true });
  }
  const next: MobileAiDevicePreferences = {
    ...prefs,
    modelStatus: "not_downloaded",
    modelId: undefined,
    modelVersion: undefined,
    modelDisplayName: undefined,
    modelDownloadUrl: undefined,
    modelLocalUri: undefined,
    modelSizeBytes: undefined,
    modelDownloadedBytes: undefined,
    modelDownloadProgressPct: undefined,
    modelResumeData: undefined,
    modelAvailableVersion: undefined,
    modelChecksum: undefined,
    modelDownloadedAt: undefined,
    modelErrorMessage: undefined,
  };
  await saveMobileAiPreferences(next);
  return next;
}

export async function markMobileAiModelUpdateAvailable(
  version = getConfiguredMobileAiModel().version
): Promise<MobileAiDevicePreferences> {
  return patchMobileAiPreferences({ modelAvailableVersion: version });
}
