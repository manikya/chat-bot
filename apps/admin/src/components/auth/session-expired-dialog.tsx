"use client";

import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SessionExpiredDialog() {
  const { sessionExpired, dismissSessionExpired } = useAuth();
  const router = useRouter();

  if (!sessionExpired) return null;

  const goToLogin = () => {
    dismissSessionExpired();
    router.push("/login");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-description"
    >
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle id="session-expired-title">Session expired</CardTitle>
          <CardDescription id="session-expired-description">
            Your session has ended for security reasons. Sign in again to continue where you left off.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={goToLogin}>
            <LogIn className="h-4 w-4" />
            Go to login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
