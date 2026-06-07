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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api.dashboard.getStats().then((r) => setStats(r.data));
  }, []);

  if (!stats) return <div className="text-muted-foreground">Loading dashboard...</div>;

  const cards = [
    { label: "Messages today", value: stats.messagesToday, icon: MessageSquare, href: "/conversations" },
    { label: "Messages this month", value: stats.messagesThisMonth, icon: MessageSquare, href: "/usage" },
    { label: "Active conversations", value: stats.activeConversations, icon: Radio, href: "/conversations" },
    { label: "Orders influenced", value: stats.ordersInfluenced, icon: ShoppingBag, href: "/conversations" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your AI assistant performance</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{c.value}</div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quota usage</CardTitle>
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
            <CardTitle className="text-base">Channel health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(stats.channelHealth).map(([ch, status]) => (
              <div key={ch} className="flex items-center justify-between text-sm">
                <span className="capitalize">{ch}</span>
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
