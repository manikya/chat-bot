/**
 * v2 — Push notifications when notifyAgentInboundMessage fires.
 *
 * Planned flow:
 * 1. Register Expo push token on login → POST /api/v1/devices/register
 * 2. Backend stores token per user/tenant; cron or inbound hook sends Expo push
 * 3. Deep link: commercechat://thread/{conversationId}
 *
 * Install when ready: npx expo install expo-notifications expo-device
 */

export async function registerForPushNotifications(): Promise<string | null> {
  // TODO(v2): implement with expo-notifications
  return null;
}
