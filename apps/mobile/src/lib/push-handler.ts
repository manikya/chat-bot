import * as Notifications from "expo-notifications";

let configured = false;

/** Configure once; avoid running at import time before native modules are ready. */
export function ensureNotificationHandler() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
