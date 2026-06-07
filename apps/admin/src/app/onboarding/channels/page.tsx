"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import type { ChannelInfo } from "@commercechat/mock-api";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OnboardingChannelsPage() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => { api.channels.list().then((r) => setChannels(r.data.channels)); }, []);

  const connect = async () => {
    setConnecting(true);
    await api.channels.connectMeta();
    toast.success("WhatsApp connected");
    setConnecting(false);
    api.channels.list().then((r) => setChannels(r.data.channels));
  };

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
          <CardDescription>Start with WhatsApp — you can add more later</CardDescription>
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
            <Button onClick={connect} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect WhatsApp"}
            </Button>
          )}
          <div className="flex gap-2">
            <Button onClick={() => next()}>Continue</Button>
            <Button variant="outline" onClick={() => next(true)}>Skip for now</Button>
          </div>
        </CardContent>
      </Card>
    </OnboardingShell>
  );
}
