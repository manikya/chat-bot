import * as SecureStore from "expo-secure-store";
import type { Tenant, User } from "@commercechat/mock-api";

export const TOKEN_KEY = "cc_access_token";
export const REFRESH_TOKEN_KEY = "cc_refresh_token";
const PROFILE_KEY = "cc_session_profile";

export interface CachedSession {
  user: User;
  tenant: Tenant;
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function setTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveSessionProfile(user: User, tenant: Tenant) {
  await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify({ user, tenant }));
}

export async function loadSessionProfile(): Promise<CachedSession | null> {
  const raw = await SecureStore.getItemAsync(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedSession;
  } catch {
    return null;
  }
}

export async function clearSessionProfile() {
  await SecureStore.deleteItemAsync(PROFILE_KEY);
}

export async function hasRefreshSession() {
  return Boolean(await getRefreshToken());
}
