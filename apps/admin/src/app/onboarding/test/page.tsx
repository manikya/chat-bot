"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { ChatSimulator } from "@/components/chat/chat-simulator";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OnboardingTestPage() {
  const router = useRouter();
  const { refreshMe } = useAuth();

  const next = async () => {
    await api.onboarding.advanceStep("widget");
    await refreshMe();
    router.push("/onboarding/widget");
  };

  return (
    <OnboardingShell currentStep="test">
      <Card>
        <CardHeader>
          <CardTitle>Test your bot</CardTitle>
          <CardDescription>Send a message to verify everything works</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChatSimulator
            greeting="Hi! How can I help you shop today?"
            suggestedQuestions={["Shipping info", "Best sellers", "Return policy"]}
            onSend={async (msg) => {
              const res = await api.onboarding.testChat(msg);
              return res.data.reply.content;
            }}
          />
          <Button onClick={next}>Continue to widget</Button>
        </CardContent>
      </Card>
    </OnboardingShell>
  );
}
