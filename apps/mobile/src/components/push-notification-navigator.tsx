import { useEffect } from "react";
import { useRouter, useRootNavigationState } from "expo-router";
import * as Notifications from "expo-notifications";

function conversationIdFromResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as { conversationId?: string };
  return data.conversationId;
}

/** Navigate to thread when user taps an agent inbound push notification. */
export function PushNotificationNavigator() {
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const navigationReady = Boolean(navigationState?.key);

  useEffect(() => {
    if (!navigationReady) return;

    const open = (response: Notifications.NotificationResponse) => {
      try {
        const conversationId = conversationIdFromResponse(response);
        if (conversationId) {
          router.push(`/thread/${conversationId}`);
        }
      } catch (err) {
        console.warn("[push] navigation failed", err);
      }
    };

    const sub = Notifications.addNotificationResponseReceivedListener(open);
    Notifications.getLastNotificationResponseAsync()
      .then((last) => {
        if (last) open(last);
      })
      .catch(() => {});

    return () => sub.remove();
  }, [navigationReady, router]);

  return null;
}
