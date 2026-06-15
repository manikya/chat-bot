import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { api } from "./api";
import { ensureNotificationHandler } from "./push-handler";

export const PUSH_TOKEN_KEY = "cc_push_token";

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("agent-alerts", {
    name: "Agent alerts",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

/** Request permission and obtain Expo push token (physical device only). */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  try {
    ensureNotificationHandler();
    await ensureAndroidChannel();

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    return tokenResponse.data;
  } catch (err) {
    console.warn("[push] token failed", err);
    return null;
  }
}

/** Register token with API and persist locally for logout cleanup. */
export async function syncPushTokenWithBackend(): Promise<void> {
  try {
    const token = await registerForPushNotifications();
    if (!token) return;

    const stored = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
    if (stored === token) return;

    await api.devices.register(token, Platform.OS);
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
  } catch (err) {
    console.warn("[push] sync failed", err);
  }
}

export async function unregisterPushFromBackend(): Promise<void> {
  const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  if (!token) return;

  try {
    await api.devices.unregister(token);
  } catch {
    /* ignore */
  }
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
}
