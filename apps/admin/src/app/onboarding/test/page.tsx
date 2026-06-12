"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { ChatSimulator } from "@/components/chat/chat-simulator";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SUGGESTED = [
  "What are your best sellers?",
  "Do you ship internationally?",
  "Show me running shoes under $100",
  "What is your return policy?",
  "Track my order",
];

export default function OnboardingTestPage() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const [testCount, setTestCount] = useState(0);
  const [canAdvance, setCanAdvance] = useState(false);
  const [debug, setDebug] = useState<{ intent?: string; tools?: string } | null>(null);
  const [showDebug, setShowDebug] = useState(false);

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
            Send at least one message to verify knowledge and product search. Try shipping, products, and orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChatSimulator
            greeting="Hi! I'm your store assistant. Ask about products, shipping, or orders."
            suggestedQuestions={SUGGESTED}
            onSend={async (msg) => {
              const res = await api.onboarding.testChat(msg);
              setTestCount(res.data.testMessageCount);
              setCanAdvance(res.data.canAdvanceToWidget);
              setDebug({
                intent: res.data.intent,
                tools: res.data.toolResults?.map((t) => `${t.tool}:${t.success ? "ok" : "fail"}`).join(", "),
              });
              return res.data.reply.content;
            }}
          />

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{testCount > 0 ? `${testCount} test message(s) sent` : "Send a message to continue"}</span>
            {debug && (
              <button type="button" className="text-primary text-xs underline" onClick={() => setShowDebug((v) => !v)}>
                {showDebug ? "Hide" : "Show"} debug
              </button>
            )}
          </div>

          {showDebug && debug && (
            <pre className="rounded-lg bg-muted p-3 text-xs overflow-x-auto">
              {JSON.stringify(debug, null, 2)}
            </pre>
          )}

          <Button onClick={next} disabled={!canAdvance}>
            Continue to widget
          </Button>
        </CardContent>
      </Card>
    </OnboardingShell>
  );
}
