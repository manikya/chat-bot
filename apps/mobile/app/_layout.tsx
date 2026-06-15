import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../src/lib/auth";
import { PushNotificationNavigator } from "../src/components/push-notification-navigator";
import { ScreenErrorBoundary } from "../src/components/ScreenErrorBoundary";

export default function RootLayout() {
  return (
    <ScreenErrorBoundary label="root">
      <AuthProvider>
        <PushNotificationNavigator />
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="inbox" />
          <Stack.Screen name="thread/[id]" options={{ presentation: "card" }} />
        </Stack>
      </AuthProvider>
    </ScreenErrorBoundary>
  );
}
