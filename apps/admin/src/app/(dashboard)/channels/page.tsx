"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CheckCircle2, ListChecks, Plug, RefreshCw, Unplug } from "lucide-react";
import { api } from "@/lib/api";
import type { ChannelInfo } from "@commercechat/mock-api";
import { MetaConnectButton } from "@/components/channels/meta-connect-button";
import { MetaMessengerConnectButton } from "@/components/channels/meta-messenger-connect-button";
import { MetaInstagramConnectButton } from "@/components/channels/meta-instagram-connect-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SupportedChannel = "whatsapp" | "messenger" | "instagram" | "web";

const channelCopy: Record<
  SupportedChannel,
  {
    title: string;
    description: string;
    iconClassName: string;
    connectedLabel: string;
  }
> = {
  whatsapp: {
    title: "WhatsApp",
    description: "Webhook verified and ready for customer messages.",
    iconClassName: "border-emerald-200 bg-emerald-100 text-emerald-700",
    connectedLabel: "connected",
  },
  messenger: {
    title: "Messenger",
    description: "Facebook page token refresh scheduled and page voice echoes captured.",
    iconClassName: "border-blue-200 bg-blue-100 text-blue-700",
    connectedLabel: "healthy",
  },
  instagram: {
    title: "Instagram",
    description: "OAuth connected, messaging permission under Meta review.",
    iconClassName: "border-pink-200 bg-pink-100 text-pink-700",
    connectedLabel: "review",
  },
  web: {
    title: "Website widget",
    description: "Installed on storefront and ready for product questions.",
    iconClassName: "border-slate-200 bg-slate-100 text-slate-600",
    connectedLabel: "live",
  },
};

function channelLabel(channel: string) {
  return channelCopy[channel as SupportedChannel]?.title ?? channel;
}

function statusVariant(status?: string): "success" | "warning" | "secondary" {
  if (status === "connected" || status === "healthy" || status === "live") return "success";
  if (status === "review" || status === "error") return "warning";
  return "secondary";
}

function channelDetail(ch: ChannelInfo, health?: { status: string; detail?: string }) {
  if (health?.detail) return health.detail;
  if (ch.displayPhone) return `${ch.displayPhone} · webhook verified`;
  if (ch.pageName) return `${ch.pageName} · token refresh scheduled`;
  if (ch.channel === "web") return ch.widgetEnabled ? "Installed on storefront" : "Ready to install on storefront";
  return channelCopy[ch.channel as SupportedChannel]?.description ?? "Ready to connect.";
}

function SocialGlyph({ name }: { name: "whatsapp" | "messenger" | "facebook" | "instagram" | "tiktok" }) {
  if (name === "whatsapp") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path d="M6.6 19.2 3 20.4l1.2-3.5A8.4 8.4 0 1 1 6.6 19.2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8.3 8.4c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.6c.1.3.1.5-.1.7l-.5.6c.7 1.2 1.6 2 2.8 2.6l.7-.7c.2-.2.4-.2.7-.1l1.5.7c.3.1.4.3.4.6v.5c0 .4-.2.7-.6.9-.6.3-1.7.4-3-.2-2.5-1-4.5-3.1-5.3-5.5-.4-1.2-.2-2 .1-2.3z" fill="currentColor" />
      </svg>
    );
  }
  if (name === "messenger") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path d="M12 3C6.8 3 3 6.6 3 11.4c0 2.5 1 4.6 2.8 6.1v3.1l3.1-1.7c1 .3 2 .5 3.1.5 5.2 0 9-3.6 9-8.4S17.2 3 12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="m7.5 13 3-3 2.3 2.1 3.7-3.4-3.1 4.8-2.4-2.1L7.5 13z" fill="currentColor" />
      </svg>
    );
  }
  if (name === "facebook") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M14.2 21v-7.7h2.6l.4-3h-3V8.4c0-.9.2-1.5 1.5-1.5h1.6V4.2c-.8-.1-1.6-.2-2.4-.2-2.4 0-4.1 1.5-4.1 4.2v2.1H8.1v3h2.7V21h3.4z" />
      </svg>
    );
  }
  if (name === "instagram") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <rect x="4" y="4" width="16" height="16" rx="5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="16.9" cy="7.1" r="1.1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M14 4v9.2a4 4 0 1 1-3.4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 4c.7 2.8 2.4 4.4 5 4.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10.5 17a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z" fill="currentColor" />
    </svg>
  );
}

function WidgetGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );
}

function IconFrame({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span className={cn("grid h-8 w-8 place-items-center rounded-lg border", className)}>
      {children}
    </span>
  );
}

function ChannelIcon({ channel }: { channel: string }) {
  const copy = channelCopy[channel as SupportedChannel] ?? channelCopy.web;
  const social = channel === "whatsapp" || channel === "messenger" || channel === "instagram";
  return (
    <IconFrame className={copy.iconClassName}>
      {social ? <SocialGlyph name={channel} /> : <WidgetGlyph />}
    </IconFrame>
  );
}

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

  const channelCards = channels.filter((ch) =>
    ["whatsapp", "messenger", "instagram", "web"].includes(ch.channel)
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.075em] text-primary">
          Messaging surfaces
        </p>
        <h1 className="max-w-[760px] font-bold">Keep every commerce channel visibly alive.</h1>
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
          Each card exposes account identity, token health, next action, and risk state for WhatsApp,
          Messenger, Instagram, and web chat.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {channelCards.map((ch) => {
          const copy = channelCopy[ch.channel as SupportedChannel] ?? channelCopy.web;
          const chHealth = health[ch.channel];
          const label = ch.status === "connected" ? copy.connectedLabel : ch.status;
          return (
          <Card key={ch.channel} className="min-h-[156px]">
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
              <CardTitle className="flex items-center gap-3">
                <ChannelIcon channel={ch.channel} />
                {channelLabel(ch.channel)}
              </CardTitle>
              <Badge variant={statusVariant(chHealth?.status ?? label)}>{label}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className={cn("min-h-[40px] text-sm leading-relaxed text-muted-foreground", chHealth?.status === "error" && "text-destructive")}>
                {channelDetail(ch, chHealth)}
              </p>

              {ch.channel === "instagram" && ch.status === "disconnected" && (
                <MetaInstagramConnectButton returnPath="/channels" />
              )}
              {ch.channel === "instagram" && ch.status === "connected" && (
                <Button size="sm" onClick={() => disconnect("instagram")}>
                  <ListChecks className="h-3.5 w-3.5" />
                  Open checklist
                </Button>
              )}

              {ch.channel === "whatsapp" && ch.status === "disconnected" && (
                <MetaConnectButton returnPath="/channels" />
              )}
              {ch.channel === "whatsapp" && ch.status === "connected" && (
                <Button variant="outline" size="sm" onClick={() => disconnect("whatsapp")}>
                  <Unplug className="h-3.5 w-3.5" />
                  Disconnect
                </Button>
              )}

              {ch.channel === "messenger" && ch.status === "disconnected" && (
                <MetaMessengerConnectButton returnPath="/channels" />
              )}
              {ch.channel === "messenger" && ch.status === "connected" && (
                <Button variant="outline" size="sm" onClick={() => disconnect("messenger")}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh token
                </Button>
              )}

              {ch.channel === "web" && (
                <Badge variant="success">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Widget active
                </Badge>
              )}
            </CardContent>
          </Card>
          );
        })}

        <Card className="min-h-[156px]">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
            <CardTitle className="flex items-center gap-3">
              <IconFrame className="border-blue-200 bg-blue-100 text-blue-700">
                <SocialGlyph name="facebook" />
              </IconFrame>
              Facebook comments
            </CardTitle>
            <Badge variant="secondary">planned</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="min-h-[40px] text-sm leading-relaxed text-muted-foreground">
              Route public product questions from posts into the same triage queue after permissions are approved.
            </p>
            <Button variant="outline" size="sm">
              <Plug className="h-3.5 w-3.5" />
              Prepare app review
            </Button>
          </CardContent>
        </Card>

        <Card className="min-h-[156px]">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
            <CardTitle className="flex items-center gap-3">
              <IconFrame className="border-slate-900 bg-slate-900 text-white">
                <SocialGlyph name="tiktok" />
              </IconFrame>
              TikTok shop DMs
            </CardTitle>
            <Badge variant="secondary">planned</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="min-h-[40px] text-sm leading-relaxed text-muted-foreground">
              Hold a future slot for short-form commerce messages without showing it as an active integration.
            </p>
            <Button variant="outline" size="sm">
              <ListChecks className="h-3.5 w-3.5" />
              Track requirements
            </Button>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
