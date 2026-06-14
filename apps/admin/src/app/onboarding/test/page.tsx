"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { onboardingTestGreeting, suggestedQuestionsForTimezone } from "@/lib/chat-locale";
import { ChatSimulator } from "@/components/chat/chat-simulator";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OnboardingTestPage() {
  const router = useRouter();
  const { tenant, refreshMe } = useAuth();
  const suggested = suggestedQuestionsForTimezone(tenant?.timezone);
  const [testCount, setTestCount] = useState(0);
  const [canAdvance, setCanAdvance] = useState(false);

  const next = async () => {
    if (!canAdvance) return;
    await api.onboarding.advanceStep("widget");
    await refreshMe();
    router.push("/onboarding/widget");
  };

  return (
    <OnboardingShell currentStep="test">
      <Card>
        <CardHeader>
          <CardTitle>Test your bot</CardTitle>
          <CardDescription>
            Send at least one message in English, Sinhala, Tamil, or Singlish to verify the bot.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChatSimulator
            greeting={onboardingTestGreeting(tenant?.storeName, tenant?.timezone)}
            suggestedQuestions={suggested}
            onSend={async (msg) => {
              const res = await api.onboarding.testChat(msg);
              setTestCount(res.data.testMessageCount);
              setCanAdvance(res.data.canAdvanceToWidget);
              return res.data.reply.content;
            }}
          />

          <p className="text-sm text-muted-foreground">
            {testCount > 0 ? `${testCount} test message(s) sent` : "Send a message to continue"}
          </p>

          <Button onClick={next} disabled={!canAdvance}>
            Continue to widget
          </Button>
        </CardContent>
      </Card>
    </OnboardingShell>
  );
}
