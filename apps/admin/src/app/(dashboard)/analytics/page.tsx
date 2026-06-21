"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Link2, MessageSquare, Radio, ShoppingCart } from "lucide-react";
import { api } from "@/lib/api";
import type { ConversationAnalytics } from "@commercechat/mock-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminPageSkeleton } from "@/components/layout/page-skeleton";

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 29);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-2.5">
      <div className="flex justify-between text-sm">
        <span className="truncate pr-2 font-medium capitalize">{label}</span>
        <span className="font-mono text-muted-foreground tabular-nums">{count}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-secondary">
        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MessagesChart({ data }: { data: ConversationAnalytics["messagesByDay"] }) {
  const max = Math.max(...data.map((d) => d.messages), 1);
  return (
    <div className="flex h-[260px] items-end gap-2 rounded-lg border border-border bg-gradient-to-b from-muted to-card px-4 pb-7 pt-5">
      {data.map((d) => {
        const height = Math.max(4, Math.round((d.messages / max) * 100));
        return (
          <div key={d.date} className="relative flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{d.messages || ""}</span>
            <div
              className="w-full rounded-t-lg bg-gradient-to-b from-teal-300 to-primary shadow-sm transition-all"
              style={{ height: `${d.messages ? height : 0}%`, minHeight: d.messages ? 4 : 0 }}
              title={`${d.date}: ${d.messages} messages`}
            />
            <span className="absolute -bottom-5 text-[9px] text-muted-foreground">{d.date.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState(defaultRange);
  const [data, setData] = useState<ConversationAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.analytics
      .get(range)
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [range.from, range.to]);

  const channelMax = useMemo(
    () => Math.max(...(data?.channelBreakdown.map((c) => c.count) ?? [1])),
    [data]
  );
  const intentMax = useMemo(
    () => Math.max(...(data?.intentBreakdown.map((i) => i.count) ?? [1])),
    [data]
  );

  if (loading && !data) {
    return <AdminPageSkeleton cards={5} />;
  }

  if (!data) {
    return <div className="text-muted-foreground">No analytics data available.</div>;
  }

  const summaryCards = [
    { label: "Messages", value: data.summary.messagesTotal, icon: MessageSquare, delta: "30 day window" },
    { label: "Conversations", value: data.summary.conversationsTotal, icon: Radio, delta: "total threads" },
    { label: "Active now", value: data.summary.conversationsActive, icon: BarChart3, delta: "open sessions" },
    { label: "Carts started", value: data.summary.cartsStarted, icon: ShoppingCart, delta: "commerce intent" },
    { label: "Checkout links", value: data.summary.checkoutLinks, icon: Link2, delta: "purchase ready" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.075em] text-primary">
            Conversation intelligence
          </p>
          <h1 className="max-w-[760px] font-bold">Connect channels, intents, products, and checkout behavior.</h1>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            Conversation volume, channel mix, intent mix, product searches, and commerce funnel performance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="font-medium text-muted-foreground">From</label>
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="h-9 rounded-lg border border-input bg-white px-3 py-1 font-mono text-xs"
          />
          <label className="font-medium text-muted-foreground">To</label>
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="h-9 rounded-lg border border-input bg-white px-3 py-1 font-mono text-xs"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((c) => {
          const Icon = c.icon;
          return (
          <Card key={c.label} className="min-h-[118px]">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-teal-200 bg-teal-100 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <CardTitle className="font-medium text-muted-foreground">{c.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="font-mono text-3xl font-semibold tracking-[-0.03em] tabular-nums">{c.value}</div>
              <p className="text-xs font-semibold text-primary">{c.delta}</p>
            </CardContent>
          </Card>
        );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
                <BarChart3 className="h-4 w-4" />
              </span>
              Message volume
            </CardTitle>
            <Badge variant="success">Healthy</Badge>
          </CardHeader>
          <CardContent>
            <MessagesChart data={data.messagesByDay} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
                <ShoppingCart className="h-4 w-4" />
              </span>
              Commerce funnel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {[
              { label: "Conversations", value: data.funnel.conversations },
              { label: "With cart", value: data.funnel.withCart },
              { label: "Checkout links sent", value: data.funnel.checkoutLinks },
            ].map((step) => (
              <div key={step.label} className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2.5 text-sm">
                <span className="font-medium">{step.label}</span>
                <Badge variant="secondary">{step.value}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By channel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.channelBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages in this period.</p>
            ) : (
              data.channelBreakdown.map((c) => (
                <BarRow key={c.channel} label={c.channel} count={c.count} max={channelMax} />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By intent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.intentBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No intent metadata in this period.</p>
            ) : (
              data.intentBreakdown.map((i) => (
                <BarRow key={i.intent} label={i.intent.replace(/_/g, " ")} count={i.count} max={intentMax} />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {data.topProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top product searches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topProducts.map((p) => (
              <BarRow
                key={p.label}
                label={p.label}
                count={p.count}
                max={data.topProducts[0]?.count ?? 1}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
