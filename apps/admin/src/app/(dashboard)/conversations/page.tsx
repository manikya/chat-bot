"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Clock3, MessageSquare, Radio, ShoppingCart, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import type { Conversation } from "@commercechat/mock-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminPageSkeleton } from "@/components/layout/page-skeleton";
import { IconFrame, MetricTile, PageIntro, SectionHeader } from "@/components/layout/admin-page";
import { funnelStageLabel } from "@/lib/funnel-stage";
import { intentLabel, subIntentLabel } from "@/lib/chat-intent";
import { conversationThreadHref } from "@/lib/conversation-id";

const CHANNELS = ["all", "whatsapp", "web", "messenger", "instagram"] as const;

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === "LKR" ? "en-LK" : "en", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export default function ConversationsPage() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [handlingFilter, setHandlingFilter] = useState<"all" | "human">("all");
  const [cartFilter, setCartFilter] = useState<"all" | "with-cart" | "abandoned">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.conversations
      .list({
        channel: filter === "all" ? undefined : filter,
        handlingMode: handlingFilter === "human" ? "human" : undefined,
      })
      .then((r) => setItems(r.data.items))
      .finally(() => setLoading(false));
  }, [filter, handlingFilter]);

  if (loading) return <AdminPageSkeleton cards={4} />;

  const visibleItems = items.filter((item) => {
    if (cartFilter === "with-cart") return Boolean(item.cart?.itemCount);
    if (cartFilter === "abandoned") return item.cart?.abandoned === true;
    return true;
  });
  const humanCount = visibleItems.filter((item) => item.handlingMode === "human").length;
  const activeCount = visibleItems.filter((item) => item.status !== "closed").length;
  const totalMessages = visibleItems.reduce((sum, item) => sum + item.messageCount, 0);
  const cartCount = items.filter((item) => item.cart?.itemCount).length;
  const abandonedCount = items.filter((item) => item.cart?.abandoned).length;
  const latestActivity = visibleItems
    .map((item) => new Date(item.updatedAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Live monitor"
        title="Watch shopper intent, handoff state, and channel pressure in one queue."
        description="Customer chats across WhatsApp, Messenger, Instagram, and the website stay grouped by intent, funnel stage, and whether a human needs to step in."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Visible threads" value={visibleItems.length} detail="current filter" icon={<MessageSquare className="h-4 w-4" />} />
        <MetricTile label="Active sessions" value={activeCount} detail="not closed" icon={<Radio className="h-4 w-4" />} />
        <MetricTile label="Carts" value={cartCount} detail={`${abandonedCount} abandoned`} icon={<ShoppingCart className="h-4 w-4" />} />
        <MetricTile
          label="Messages"
          value={totalMessages}
          detail={latestActivity ? `latest ${new Date(latestActivity).toLocaleTimeString()}` : "no activity"}
          icon={<Clock3 className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          {CHANNELS.map((ch) => (
            <Button key={ch} variant={filter === ch ? "default" : "outline"} size="sm" onClick={() => setFilter(ch)}>
              {ch === "all" ? "All channels" : ch}
            </Button>
          ))}
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <Button
            variant={handlingFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setHandlingFilter("all")}
          >
            All handling
          </Button>
          <Button
            variant={handlingFilter === "human" ? "default" : "outline"}
            size="sm"
            onClick={() => setHandlingFilter("human")}
          >
            Needs agent
          </Button>
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <Button
            variant={cartFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setCartFilter("all")}
          >
            All carts
          </Button>
          <Button
            variant={cartFilter === "with-cart" ? "default" : "outline"}
            size="sm"
            onClick={() => setCartFilter("with-cart")}
          >
            With cart
          </Button>
          <Button
            variant={cartFilter === "abandoned" ? "default" : "outline"}
            size="sm"
            onClick={() => setCartFilter("abandoned")}
          >
            Abandoned
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <SectionHeader
            eyebrow="Conversation queue"
            title={`${visibleItems.length} conversations`}
            description="Open a thread to inspect messages, shopper context, cart state, and handoff controls."
          />
          <Badge variant={abandonedCount ? "warning" : humanCount ? "warning" : "success"}>
            {abandonedCount ? `${abandonedCount} abandoned carts` : humanCount ? `${humanCount} need agent` : "bot controlled"}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Handling</TableHead>
                <TableHead>Funnel</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>Cart</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleItems.map((c) => (
                <TableRow key={c.conversationId}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <IconFrame className="border-slate-200 bg-slate-100 text-slate-700">
                        {c.handlingMode === "human" ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </IconFrame>
                      <div>
                        <p className="font-medium">{c.customerName ?? c.externalUserId}</p>
                        <p className="text-xs text-muted-foreground">{c.externalUserId}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{c.channel}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={c.handlingMode === "human" ? "default" : "outline"}>
                      {c.handlingMode === "human" ? "Human" : "Bot"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{funnelStageLabel(c.funnelStage)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{intentLabel(c.lastIntent)}</Badge>
                    {c.lastSubIntent && (
                      <span className="text-xs text-muted-foreground ml-1">
                        · {subIntentLabel(c.lastSubIntent)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.cart?.itemCount ? (
                      <div className="space-y-1">
                        <Badge variant={c.cart.abandoned ? "warning" : "success"}>
                          {c.cart.checkoutUrl ? "Checkout sent" : c.cart.abandoned ? "Abandoned" : "Active cart"}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {c.cart.itemCount} item{c.cart.itemCount === 1 ? "" : "s"} ·{" "}
                          {formatMoney(c.cart.subtotal, c.cart.currency)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No cart</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono">{c.messageCount}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(c.updatedAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={conversationThreadHref(c.conversationId)}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {visibleItems.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No conversations match this filter yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
