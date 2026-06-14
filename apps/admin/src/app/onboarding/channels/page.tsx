"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { requireChannelsInOnboarding } from "@/lib/onboarding-env";
import type { ChannelInfo } from "@commercechat/mock-api";
import { MetaConnectButton } from "@/components/channels/meta-connect-button";
import { MetaMessengerConnectButton } from "@/components/channels/meta-messenger-connect-button";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OnboardingChannelsPage() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [health, setHealth] = useState<Record<string, { status: string; detail?: string }>>({});
  const requireChannel = requireChannelsInOnboarding();

  const load = async () => {
    const [listRes, healthRes] = await Promise.all([
      api.channels.list(),
      api.channels.health().catch(() => null),
    ]);
    setChannels(listRes.data.channels);
    if (healthRes?.data) setHealth(healthRes.data as Record<string, { status: string; detail?: string }>);
  };

  useEffect(() => {
    load();
  }, []);

  const wa = channels.find((c) => c.channel === "whatsapp");
  const messenger = channels.find((c) => c.channel === "messenger");
  const web = channels.find((c) => c.channel === "web");
  const anyConnected = wa?.status === "connected" || messenger?.status === "connected";

  const next = async (skip = false) => {
    if (requireChannel && !anyConnected && skip) {
      toast.error("Connect WhatsApp or Messenger before continuing");
      return;
    }
    await api.onboarding.advanceStep("knowledge", skip);
    await refreshMe();
    router.push("/onboarding/knowledge");
  };

  return (
    <OnboardingShell currentStep="channels">
      <Card>
        <CardHeader>
          <CardTitle>Connect channels</CardTitle>
          <CardDescription>
            Link Meta so customers can message you on WhatsApp and Messenger. Web chat is enabled automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">WhatsApp</p>
                {wa?.displayPhone && <p className="text-sm text-muted-foreground">{wa.displayPhone}</p>}
                {health.whatsapp?.detail && (
                  <p className="text-xs text-muted-foreground">{health.whatsapp.detail}</p>
                )}
              </div>
              <Badge variant={wa?.status === "connected" ? "success" : "secondary"}>{wa?.status ?? "disconnected"}</Badge>
            </div>
            {wa?.status !== "connected" && (
              <MetaConnectButton returnPath="/onboarding/channels" />
            )}
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Messenger</p>
                {messenger?.pageName && <p className="text-sm text-muted-foreground">{messenger.pageName}</p>}
                {health.messenger?.detail && (
                  <p className="text-xs text-muted-foreground">{health.messenger.detail}</p>
                )}
              </div>
              <Badge variant={messenger?.status === "connected" ? "success" : "secondary"}>
                {messenger?.status ?? "disconnected"}
              </Badge>
            </div>
            {messenger?.status !== "connected" && (
              <MetaMessengerConnectButton returnPath="/onboarding/channels" />
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/30">
            <div>
              <p className="font-medium">Web widget</p>
              <p className="text-sm text-muted-foreground">Embed chat on your storefront</p>
            </div>
            <Badge variant={web?.status === "connected" ? "success" : "secondary"}>Auto-enabled</Badge>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => next()}>Continue</Button>
            {!requireChannel && (
              <Button variant="outline" onClick={() => next(true)}>
                Skip for now
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </OnboardingShell>
  );
}
