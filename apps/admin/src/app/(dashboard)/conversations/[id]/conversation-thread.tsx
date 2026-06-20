"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Bot, Send, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { conversationIdFromPath, conversationIdFromSearchParams } from "@/lib/conversation-id";
import type { ConversationDetail, Message } from "@commercechat/mock-api";
import { useAuth } from "@/lib/auth/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { funnelStageLabel } from "@/lib/funnel-stage";
import { intentLabel, subIntentLabel } from "@/lib/chat-intent";
import { formatQualificationSummary } from "@/lib/qualification-summary";

const META_CHANNELS = new Set(["whatsapp", "messenger", "instagram"]);

export default function ConversationThreadPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramId = params.id && params.id !== "_" ? params.id : null;
  const pathId = conversationIdFromPath(pathname) ?? conversationIdFromSearchParams(searchParams);
  const id = paramId ?? pathId;
  const { user } = useAuth();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canReply = user?.role === "owner" || user?.role === "admin";
  const isHuman = detail?.handlingMode === "human";
  const manualSupported =
    detail?.manualReplySupported ?? (detail ? META_CHANNELS.has(detail.channel) : false);

  const reload = useCallback(async () => {
    if (!id) return;
    const [d, m] = await Promise.all([
      api.conversations.get(id),
      api.conversations.getMessages(id),
    ]);
    setDetail(d.data);
    setMessages(m.data.items);
  }, [id]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Invalid conversation link");
      return;
    }
    setLoading(true);
    setError(null);
    reload()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load conversation"))
      .finally(() => setLoading(false));
  }, [id, reload]);

  async function setMode(mode: "bot" | "human", notifyCustomer?: boolean) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.conversations.setHandling(id, { mode, notifyCustomer });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update handling mode");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!id || !replyText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.conversations.reply(id, replyText.trim());
      setReplyText("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send reply");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/conversations">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to conversations
          </Link>
        </Button>
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ?? "Conversation not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/conversations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{detail.customerName ?? "Customer"}</h1>
          <div className="flex flex-wrap gap-2 mt-1">
            <Badge>{detail.channel}</Badge>
            <Badge variant={isHuman ? "default" : "secondary"}>
              {isHuman ? "Human" : "Bot"}
            </Badge>
            <Badge variant="outline">{detail.status}</Badge>
            <Badge variant="outline">{funnelStageLabel(detail.funnelStage)}</Badge>
            <Badge variant="outline">{intentLabel(detail.lastIntent)}</Badge>
            {detail.lastSubIntent && (
              <Badge variant="secondary">{subIntentLabel(detail.lastSubIntent)}</Badge>
            )}
          </div>
        </div>
        {canReply && (
          <div className="flex flex-wrap gap-2">
            {!isHuman ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setMode("human", false)}
                >
                  <UserRound className="h-4 w-4 mr-1" />
                  Take over
                </Button>
                <Button size="sm" disabled={busy} onClick={() => setMode("human", true)}>
                  Take over + notify
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setMode("bot")}
              >
                <Bot className="h-4 w-4 mr-1" />
                Return to bot
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader>
            <CardTitle className="text-base">Messages</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            {messages.map((m) => {
              const isManual = Boolean(m.metadata?.manual);
              const isHandoff = Boolean(m.metadata?.handoff);
              return (
                <div
                  key={m.messageId}
                  className={cn("flex", m.direction === "inbound" ? "justify-start" : "justify-end")}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-xl px-4 py-2 text-sm",
                      m.direction === "inbound"
                        ? "bg-muted"
                        : isManual
                          ? "bg-amber-600 text-white"
                          : "bg-primary text-primary-foreground"
                    )}
                  >
                    <p>{m.content}</p>
                    {isManual && (
                      <p className="mt-1 text-xs opacity-80">Manual reply</p>
                    )}
                    {isHandoff && (
                      <p className="mt-1 text-xs opacity-80">Handoff message</p>
                    )}
                    {m.metadata?.intent && (
                      <p className="mt-1 text-xs opacity-70">
                        Intent: {intentLabel(String(m.metadata.intent))}
                        {m.metadata.subIntent
                          ? ` · ${subIntentLabel(String(m.metadata.subIntent))}`
                          : ""}
                      </p>
                    )}
                    {m.metadata?.toolCalls && (
                      <p className="mt-1 text-xs opacity-70">
                        Tools: {m.metadata.toolCalls.join(", ")}
                      </p>
                    )}
                    <p className="mt-1 text-xs opacity-60">
                      {new Date(m.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              );
            })}

            {canReply && isHuman && (
              <div className="border-t pt-4 space-y-2">
                {!manualSupported ? (
                  <p className="text-sm text-muted-foreground">
                    Manual replies are not supported for the {detail.channel} channel yet.
                  </p>
                ) : (
                  <>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your reply to the customer..."
                      rows={3}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      disabled={busy}
                    />
                    <Button size="sm" disabled={busy || !replyText.trim()} onClick={sendReply}>
                      <Send className="h-4 w-4 mr-1" />
                      Send reply
                    </Button>
                  </>
                )}
              </div>
            )}

            {canReply && !isHuman && (
              <p className="text-sm text-muted-foreground border-t pt-4">
                Take over this conversation to reply manually. The bot will stop auto-replying until
                you return control.
              </p>
            )}
          </CardContent>
        </Card>

        {formatQualificationSummary(detail.qualification) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shopper context</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {formatQualificationSummary(detail.qualification)}
            </CardContent>
          </Card>
        )}

        {detail.cart && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cart</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {detail.cart.items.map((item) => (
                <div key={item.sku} className="flex justify-between">
                  <span>
                    {item.name} ×{item.quantity}
                  </span>
                  <span>${item.unitPrice.toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t pt-2 font-medium flex justify-between">
                <span>Subtotal</span>
                <span>${detail.cart.subtotal.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
