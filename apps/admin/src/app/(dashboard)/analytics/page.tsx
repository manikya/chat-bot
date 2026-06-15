"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { ConversationAnalytics } from "@commercechat/mock-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="truncate pr-2">{label}</span>
        <span className="text-muted-foreground tabular-nums">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MessagesChart({ data }: { data: ConversationAnalytics["messagesByDay"] }) {
  const max = Math.max(...data.map((d) => d.messages), 1);
  return (
    <div className="flex h-48 items-end gap-1">
      {data.map((d) => {
        const height = Math.max(4, Math.round((d.messages / max) * 100));
        return (
          <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[10px] text-muted-foreground tabular-nums">{d.messages || ""}</span>
            <div
              className="w-full rounded-t bg-primary/90"
              style={{ height: `${d.messages ? height : 0}%`, minHeight: d.messages ? 4 : 0 }}
              title={`${d.date}: ${d.messages} messages`}
            />
            <span className="text-[9px] text-muted-foreground">{d.date.slice(5)}</span>
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
    return <div className="text-muted-foreground">Loading analytics...</div>;
  }

  if (!data) {
    return <div className="text-muted-foreground">No analytics data available.</div>;
  }

  const summaryCards = [
    { label: "Messages", value: data.summary.messagesTotal },
    { label: "Conversations", value: data.summary.conversationsTotal },
    { label: "Active now", value: data.summary.conversationsActive },
    { label: "Carts started", value: data.summary.cartsStarted },
    { label: "Checkout links", value: data.summary.checkoutLinks },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Conversation volume, channels, intents, and commerce funnel</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-muted-foreground">From</label>
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="rounded-md border bg-background px-2 py-1"
          />
          <label className="text-muted-foreground">To</label>
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="rounded-md border bg-background px-2 py-1"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {summaryCards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Messages per day</CardTitle>
          </CardHeader>
          <CardContent>
            <MessagesChart data={data.messagesByDay} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commerce funnel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Conversations", value: data.funnel.conversations },
              { label: "With cart", value: data.funnel.withCart },
              { label: "Checkout links sent", value: data.funnel.checkoutLinks },
            ].map((step) => (
              <div key={step.label} className="flex items-center justify-between text-sm">
                <span>{step.label}</span>
                <Badge variant="secondary">{step.value}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By channel</CardTitle>
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
            <CardTitle className="text-base">By intent</CardTitle>
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
