"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ChannelInfo } from "@commercechat/mock-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [connecting, setConnecting] = useState(false);

  const load = () => api.channels.list().then((r) => setChannels(r.data.channels));
  useEffect(() => { load(); }, []);

  const connectWhatsApp = async () => {
    setConnecting(true);
    try {
      await api.channels.connectMeta();
      toast.success("WhatsApp connected!");
      load();
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Channels</h1>
        <p className="text-muted-foreground">Connect WhatsApp, Messenger, Instagram, and web</p>
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
              {ch.channel === "whatsapp" && ch.status === "disconnected" && (
                <Button onClick={connectWhatsApp} disabled={connecting}>
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect WhatsApp"}
                </Button>
              )}
              {ch.channel === "whatsapp" && ch.status === "connected" && (
                <Button variant="outline" size="sm" onClick={async () => { await api.channels.disconnect("whatsapp"); load(); }}>
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
