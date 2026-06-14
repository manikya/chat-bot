"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ChannelInfo } from "@commercechat/mock-api";
import { MetaConnectButton } from "@/components/channels/meta-connect-button";
import { MetaMessengerConnectButton } from "@/components/channels/meta-messenger-connect-button";
import { MetaInstagramConnectButton } from "@/components/channels/meta-instagram-connect-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [health, setHealth] = useState<Record<string, { status: string; detail?: string }>>({});

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

  const disconnect = async (channel: "whatsapp" | "messenger" | "instagram") => {
    await api.channels.disconnect(channel);
    const label =
      channel === "whatsapp" ? "WhatsApp" : channel === "messenger" ? "Messenger" : "Instagram";
    toast.success(`${label} disconnected`);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Channels</h1>
        <p className="text-muted-foreground">
          Connect WhatsApp, Messenger, and Instagram so customers can message your store
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {channels.map((ch) => (
          <Card key={ch.channel}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base capitalize">{ch.channel}</CardTitle>
              <Badge variant={ch.status === "connected" ? "success" : "secondary"}>{ch.status}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {ch.displayPhone && <p className="text-sm">{ch.displayPhone}</p>}
              {ch.pageName && <p className="text-sm font-medium">{ch.pageName}</p>}

              {ch.channel === "whatsapp" && health.whatsapp?.detail && (
                <p
                  className={
                    health.whatsapp.status === "error"
                      ? "text-xs text-destructive"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {health.whatsapp.detail}
                </p>
              )}
              {ch.channel === "messenger" && health.messenger?.detail && (
                <p
                  className={
                    health.messenger.status === "error"
                      ? "text-xs text-destructive"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {health.messenger.detail}
                </p>
              )}

              {ch.channel === "instagram" && health.instagram?.detail && (
                <p
                  className={
                    health.instagram.status === "error"
                      ? "text-xs text-destructive"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {health.instagram.detail}
                </p>
              )}

              {ch.channel === "instagram" && ch.status === "disconnected" && (
                <MetaInstagramConnectButton returnPath="/channels" />
              )}
              {ch.channel === "instagram" && ch.status === "connected" && (
                <Button variant="outline" size="sm" onClick={() => disconnect("instagram")}>
                  Disconnect
                </Button>
              )}

              {ch.channel === "whatsapp" && ch.status === "disconnected" && (
                <MetaConnectButton returnPath="/channels" />
              )}
              {ch.channel === "whatsapp" && ch.status === "connected" && (
                <Button variant="outline" size="sm" onClick={() => disconnect("whatsapp")}>
                  Disconnect
                </Button>
              )}

              {ch.channel === "messenger" && ch.status === "disconnected" && (
                <MetaMessengerConnectButton returnPath="/channels" />
              )}
              {ch.channel === "messenger" && ch.status === "connected" && (
                <Button variant="outline" size="sm" onClick={() => disconnect("messenger")}>
                  Disconnect
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
