import * as SecureStore from "expo-secure-store";
import type {
  MobileAiDevicePreferences,
  MobileAiSyncState,
} from "@commercechat/shared/types";
import { EMPTY_MOBILE_AI_SYNC_STATE } from "./offline-ai";

const PREFS_KEY = "cc_mobile_ai_preferences";
const SYNC_STATE_KEY = "cc_mobile_ai_sync_state";

export const DEFAULT_MOBILE_AI_PREFERENCES: MobileAiDevicePreferences = {
  allowLlmDownload: false,
  allowVectorSync: false,
  replyMode: "draft",
  modelStatus: "not_downloaded",
};

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function loadMobileAiPreferences(): Promise<MobileAiDevicePreferences> {
  const stored = parseJson<Partial<MobileAiDevicePreferences>>(await SecureStore.getItemAsync(PREFS_KEY));
  return { ...DEFAULT_MOBILE_AI_PREFERENCES, ...stored };
}

export async function saveMobileAiPreferences(
  preferences: MobileAiDevicePreferences
): Promise<void> {
  await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(preferences));
}

export async function patchMobileAiPreferences(
  patch: Partial<MobileAiDevicePreferences>
): Promise<MobileAiDevicePreferences> {
  const next = { ...(await loadMobileAiPreferences()), ...patch };
  await saveMobileAiPreferences(next);
  return next;
}

export async function loadMobileAiSyncState(): Promise<MobileAiSyncState> {
  return (
    parseJson<MobileAiSyncState>(await SecureStore.getItemAsync(SYNC_STATE_KEY)) ??
    EMPTY_MOBILE_AI_SYNC_STATE
  );
}

export async function saveMobileAiSyncState(state: MobileAiSyncState): Promise<void> {
  await SecureStore.setItemAsync(SYNC_STATE_KEY, JSON.stringify(state));
}
