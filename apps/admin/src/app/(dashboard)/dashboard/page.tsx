"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, ShoppingBag, Radio, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardStats } from "@commercechat/mock-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminPageSkeleton } from "@/components/layout/page-skeleton";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api.dashboard.getStats().then((r) => setStats(r.data));
  }, []);

  if (!stats) return <AdminPageSkeleton cards={4} />;

  const cards = [
    { label: "Messages today", value: stats.messagesToday, icon: MessageSquare, href: "/conversations" },
    { label: "Messages this month", value: stats.messagesThisMonth, icon: MessageSquare, href: "/usage" },
    { label: "Active conversations", value: stats.activeConversations, icon: Radio, href: "/conversations" },
    { label: "Orders influenced", value: stats.ordersInfluenced, icon: ShoppingBag, href: "/conversations" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.075em] text-primary">
            Live command center
          </p>
          <h1 className="max-w-[760px] font-bold">Run commerce support from one clear operations desk.</h1>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            Overview of message volume, active conversations, commerce outcomes, quota pressure, and channel health.
          </p>
        </div>
        <Button variant="default" asChild>
          <Link href="/conversations">
            Open live monitor
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href}>
              <Card className="min-h-[118px] transition-colors hover:border-primary/40">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-teal-200 bg-teal-100 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <CardTitle className="font-medium text-muted-foreground">{c.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="font-mono text-3xl font-semibold tracking-[-0.03em]">{c.value}</div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Quota usage</CardTitle>
            <Badge variant={stats.quotaPercent > 80 ? "warning" : "success"}>{stats.quotaPercent}%</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{stats.quotaPercent}% of monthly limit</span>
              <Link href="/usage" className="text-primary text-sm">View usage</Link>
            </div>
            <Progress value={stats.quotaPercent} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Channel health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {Object.entries(stats.channelHealth).map(([ch, status]) => (
              <div key={ch} className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                <span className="font-medium capitalize">{ch}</span>
                <Badge variant={status === "healthy" || status === "connected" ? "success" : "secondary"}>{status}</Badge>
              </div>
            ))}
            <Button variant="outline" size="sm" asChild className="mt-2">
              <Link href="/channels">Manage channels <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
