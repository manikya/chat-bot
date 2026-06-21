"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Conversation } from "@commercechat/mock-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminPageSkeleton } from "@/components/layout/page-skeleton";
import { funnelStageLabel } from "@/lib/funnel-stage";
import { intentLabel, subIntentLabel } from "@/lib/chat-intent";
import { conversationThreadHref } from "@/lib/conversation-id";

const CHANNELS = ["all", "whatsapp", "web", "messenger", "instagram"] as const;

export default function ConversationsPage() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [handlingFilter, setHandlingFilter] = useState<"all" | "human">("all");
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conversations</h1>
        <p className="text-muted-foreground">Customer chats across WhatsApp, Messenger, and your website</p>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {CHANNELS.map((ch) => (
          <Button key={ch} variant={filter === ch ? "default" : "outline"} size="sm" onClick={() => setFilter(ch)}>
            {ch === "all" ? "All" : ch}
          </Button>
        ))}
        <span className="text-muted-foreground text-sm mx-1">|</span>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{items.length} conversations</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Handling</TableHead>
                <TableHead>Funnel</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.conversationId}>
                  <TableCell className="font-medium">{c.customerName ?? c.externalUserId}</TableCell>
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
                  <TableCell>{c.messageCount}</TableCell>
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
        </CardContent>
      </Card>
    </div>
  );
}
