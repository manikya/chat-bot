import { useEffect } from "react";
import { useRouter, useRootNavigationState } from "expo-router";
import * as Notifications from "expo-notifications";

function routeFromResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as {
    conversationId?: string;
    route?: string;
  };
  if (data.route?.startsWith("/")) return data.route;
  if (data.conversationId) return `/thread/${data.conversationId}`;
  return null;
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
        const route = routeFromResponse(response);
        if (route) {
          router.push(route);
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
