"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { ConversationDetail, Message } from "@commercechat/mock-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function ConversationThreadPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!id) return;
    api.conversations.get(id).then((r) => setDetail(r.data));
    api.conversations.getMessages(id).then((r) => setMessages(r.data.items));
  }, [id]);

  if (!detail) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/conversations"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold">{detail.customerName ?? "Customer"}</h1>
          <div className="flex gap-2 mt-1">
            <Badge>{detail.channel}</Badge>
            <Badge variant="secondary">{detail.status}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Messages</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {messages.map((m) => (
              <div key={m.messageId} className={cn("flex", m.direction === "inbound" ? "justify-start" : "justify-end")}>
                <div className={cn("max-w-[80%] rounded-xl px-4 py-2 text-sm", m.direction === "inbound" ? "bg-muted" : "bg-primary text-primary-foreground")}>
                  <p>{m.content}</p>
                  {m.metadata?.toolCalls && (
                    <p className="mt-1 text-xs opacity-70">Tools: {m.metadata.toolCalls.join(", ")}</p>
                  )}
                  <p className="mt-1 text-xs opacity-60">{new Date(m.createdAt).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {detail.cart && (
          <Card>
            <CardHeader><CardTitle className="text-base">Cart</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {detail.cart.items.map((item) => (
                <div key={item.sku} className="flex justify-between">
                  <span>{item.name} ×{item.quantity}</span>
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
