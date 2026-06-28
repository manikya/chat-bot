"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Bot, MessageSquare, Send, ShoppingCart, UserRound } from "lucide-react";
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
import { SplitPageSkeleton } from "@/components/layout/page-skeleton";
import { IconFrame, MetricTile, PageIntro } from "@/components/layout/admin-page";

const META_CHANNELS = new Set(["whatsapp", "messenger", "instagram"]);

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
    return <SplitPageSkeleton />;
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

  const qualificationSummary = formatQualificationSummary(detail.qualification);
  const inboundCount = messages.filter((message) => message.direction === "inbound").length;
  const outboundCount = messages.length - inboundCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/conversations" aria-label="Back to conversations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <PageIntro
            eyebrow="Conversation detail"
            title={detail.customerName ?? "Customer conversation"}
            description={`${detail.channel} thread with ${detail.messageCount} messages, ${intentLabel(detail.lastIntent)} intent, and ${funnelStageLabel(detail.funnelStage)} funnel state.`}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{detail.channel}</Badge>
            <Badge variant={isHuman ? "default" : "secondary"}>{isHuman ? "Human" : "Bot"}</Badge>
            <Badge variant="outline">{detail.status}</Badge>
            <Badge variant="outline">{funnelStageLabel(detail.funnelStage)}</Badge>
            <Badge variant="outline">{intentLabel(detail.lastIntent)}</Badge>
            {detail.lastSubIntent && <Badge variant="secondary">{subIntentLabel(detail.lastSubIntent)}</Badge>}
          </div>
        </div>
        {canReply && (
          <div className="flex flex-wrap gap-2 pt-1">
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Inbound" value={inboundCount} detail="customer messages" icon={<UserRound className="h-4 w-4" />} />
        <MetricTile label="Outbound" value={outboundCount} detail={isHuman ? "manual mode" : "bot replies"} icon={<Bot className="h-4 w-4" />} />
        <MetricTile label="Intent" value={intentLabel(detail.lastIntent)} detail={detail.lastSubIntent ? subIntentLabel(detail.lastSubIntent) : "latest detected"} icon={<MessageSquare className="h-4 w-4" />} />
        <MetricTile
          label="Cart"
          value={detail.cart?.items.length ?? 0}
          detail={
            detail.cart
              ? `${formatMoney(detail.cart.subtotal, detail.cart.currency)}${detail.cart.abandoned ? " · abandoned" : ""}`
              : "no active cart"
          }
          icon={<ShoppingCart className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex flex-col lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-3">
              <IconFrame>
                <MessageSquare className="h-4 w-4" />
              </IconFrame>
              Message timeline
            </CardTitle>
            <Badge variant={isHuman ? "warning" : "success"}>{isHuman ? "human takeover" : "bot active"}</Badge>
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
                      "max-w-[82%] rounded-2xl border px-4 py-2.5 text-sm shadow-sm",
                      m.direction === "inbound"
                        ? "border-border bg-muted"
                        : isManual
                          ? "border-amber-600 bg-amber-600 text-white"
                          : "border-primary bg-primary text-primary-foreground"
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
              <div className="space-y-2 border-t pt-4">
                {!manualSupported ? (
                  <p className="text-sm text-muted-foreground">
                    Manual replies are not supported for {detail.channel} yet. Web visitors are asked to share
                    phone or email for follow-up when the chat is in human mode.
                  </p>
                ) : (
                  <>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your reply to the customer..."
                      rows={3}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <p className="border-t pt-4 text-sm text-muted-foreground">
                Take over this conversation to reply manually. The bot will stop auto-replying until
                you return control.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
        {qualificationSummary && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <IconFrame className="border-slate-200 bg-slate-100 text-slate-700">
                  <UserRound className="h-4 w-4" />
                </IconFrame>
                Shopper context
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {qualificationSummary}
            </CardContent>
          </Card>
        )}

        {detail.cart && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <IconFrame className="border-emerald-200 bg-emerald-100 text-emerald-700">
                  <ShoppingCart className="h-4 w-4" />
                </IconFrame>
                Cart
              </CardTitle>
              <Badge variant={detail.cart.abandoned ? "warning" : "success"}>
                {detail.cart.abandoned ? "Abandoned" : "Active"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {detail.cart.items.map((item) => (
                <div key={item.sku} className="flex justify-between">
                  <span>
                    {item.name} ×{item.quantity}
                  </span>
                  <span>{formatMoney(item.unitPrice, detail.cart!.currency)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>Subtotal</span>
                <span>{formatMoney(detail.cart.subtotal, detail.cart.currency)}</span>
              </div>
              {detail.cart.checkoutUrl && (
                <div className="rounded-lg border bg-muted p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Checkout link
                  </p>
                  <a
                    href={detail.cart.checkoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block break-all text-sm font-medium text-primary"
                  >
                    {detail.cart.checkoutUrl}
                  </a>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {detail.cart.checkoutProvider ?? "checkout"}{" "}
                    {detail.cart.checkoutExternalId ? `#${detail.cart.checkoutExternalId}` : ""}
                  </p>
                </div>
              )}
              {detail.cart.updatedAt && (
                <p className="text-xs text-muted-foreground">
                  Last cart update: {new Date(detail.cart.updatedAt).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
}
