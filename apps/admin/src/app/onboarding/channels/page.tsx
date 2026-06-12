"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { requireChannelsInOnboarding, apiPublicBaseUrl } from "@/lib/onboarding-env";
import { getMetaOAuthRedirectUri } from "@/lib/meta-oauth";
import type { ChannelInfo } from "@commercechat/mock-api";
import { MetaConnectButton } from "@/components/channels/meta-connect-button";
import { MetaMessengerConnectButton } from "@/components/channels/meta-messenger-connect-button";
import { MetaDevConnectButton } from "@/components/channels/meta-dev-connect-button";
import { MetaMessengerDevConnectButton } from "@/components/channels/meta-messenger-dev-connect-button";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OnboardingChannelsPage() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [health, setHealth] = useState<Record<string, { status: string; detail?: string }>>({});
  const [devConnectAvailable, setDevConnectAvailable] = useState(false);
  const [messengerDevConnectAvailable, setMessengerDevConnectAvailable] = useState(false);
  const requireChannel = requireChannelsInOnboarding();

  const load = async () => {
    const [listRes, healthRes, devStatusRes] = await Promise.all([
      api.channels.list(),
      api.channels.health().catch(() => null),
      api.channels.metaDevStatus().catch(() => null),
    ]);
    setChannels(listRes.data.channels);
    if (healthRes?.data) setHealth(healthRes.data as Record<string, { status: string; detail?: string }>);
    if (devStatusRes?.data) {
      setDevConnectAvailable(Boolean(devStatusRes.data.devConnectAvailable));
      setMessengerDevConnectAvailable(Boolean(devStatusRes.data.messengerDevConnectAvailable));
    }
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
      toast.error("Connect WhatsApp or Messenger before continuing on production");
      return;
    }
    await api.onboarding.advanceStep("knowledge", skip);
    await refreshMe();
    router.push("/onboarding/knowledge");
  };

  const webhookUrl = `${apiPublicBaseUrl()}/webhooks/meta`;

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
              <>
                <MetaConnectButton returnPath="/onboarding/channels" />
                {devConnectAvailable && <MetaDevConnectButton onConnected={load} />}
              </>
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
              <>
                <MetaMessengerConnectButton returnPath="/onboarding/channels" />
                {messengerDevConnectAvailable && <MetaMessengerDevConnectButton onConnected={load} />}
              </>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/30">
            <div>
              <p className="font-medium">Web widget</p>
              <p className="text-sm text-muted-foreground">Embed chat on your storefront</p>
            </div>
            <Badge variant={web?.status === "connected" ? "success" : "secondary"}>Auto-enabled</Badge>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground rounded-lg bg-muted/50 p-3">
            <p className="font-medium text-foreground">Meta app checklist</p>
            <p>
              OAuth redirect:{" "}
              <code className="break-all">{getMetaOAuthRedirectUri()}</code>
            </p>
            <p>
              Webhook URL: <code className="break-all">{webhookUrl}</code>
            </p>
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
