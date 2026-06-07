"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import type { ChannelInfo } from "@commercechat/mock-api";
import { MetaConnectButton } from "@/components/channels/meta-connect-button";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OnboardingChannelsPage() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);

  useEffect(() => {
    api.channels.list().then((r) => setChannels(r.data.channels));
  }, []);

  const next = async (skip = false) => {
    await api.onboarding.advanceStep("knowledge", skip);
    await refreshMe();
    router.push("/onboarding/knowledge");
  };

  const wa = channels.find((c) => c.channel === "whatsapp");

  return (
    <OnboardingShell currentStep="channels">
      <Card>
        <CardHeader>
          <CardTitle>Connect channels</CardTitle>
          <CardDescription>Authorize Meta to link your WhatsApp Business number</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">WhatsApp</p>
              {wa?.displayPhone && <p className="text-sm text-muted-foreground">{wa.displayPhone}</p>}
            </div>
            <Badge variant={wa?.status === "connected" ? "success" : "secondary"}>{wa?.status}</Badge>
          </div>
          {wa?.status !== "connected" && (
            <MetaConnectButton returnPath="/onboarding/channels" />
          )}
          <div className="flex gap-2">
            <Button onClick={() => next()}>Continue</Button>
            <Button variant="outline" onClick={() => next(true)}>
              Skip for now
            </Button>
          </div>
        </CardContent>
      </Card>
    </OnboardingShell>
  );
}
