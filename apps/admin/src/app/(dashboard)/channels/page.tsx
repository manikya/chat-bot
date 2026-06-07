"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ChannelInfo } from "@commercechat/mock-api";
import { MetaConnectButton } from "@/components/channels/meta-connect-button";
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

  const disconnectWhatsApp = async () => {
    await api.channels.disconnect("whatsapp");
    toast.success("WhatsApp disconnected");
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Channels</h1>
        <p className="text-muted-foreground">Connect WhatsApp via Meta OAuth — each store uses its own number</p>
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
              {ch.channel === "whatsapp" && health.whatsapp?.detail && (
                <p className="text-xs text-muted-foreground">{health.whatsapp.detail}</p>
              )}
              {ch.channel === "whatsapp" && ch.status === "disconnected" && (
                <MetaConnectButton returnPath="/channels" />
              )}
              {ch.channel === "whatsapp" && ch.status === "connected" && (
                <Button variant="outline" size="sm" onClick={disconnectWhatsApp}>
                  Disconnect
                </Button>
              )}
              {(ch.channel === "messenger" || ch.channel === "instagram") && (
                <p className="text-xs text-muted-foreground">Available in Phase 2</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
