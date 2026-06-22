"use client";

import { useState } from "react";
import { Loader2, MessageCircle, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatSimulatorProps {
  greeting?: string;
  suggestedQuestions?: string[];
  storeName?: string;
  primaryColor?: string;
  onSend: (message: string) => Promise<string>;
  className?: string;
}

export function ChatSimulator({
  greeting,
  suggestedQuestions = [],
  storeName = "Store assistant",
  primaryColor = "#4F46E5",
  onSend,
  className,
}: ChatSimulatorProps) {
  const [messages, setMessages] = useState<Message[]>(
    greeting ? [{ role: "assistant", content: greeting }] : []
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const reply = await onSend(text);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sorry, I could not respond right now. Please check the API connection." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("overflow-hidden rounded-[1.75rem] border border-border/80 bg-background shadow-xl", className)}>
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 text-white"
        style={{ background: primaryColor }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/18 ring-1 ring-white/25">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{storeName}</p>
            <p className="flex items-center gap-1 text-[11px] text-white/75">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Test widget preview
            </p>
          </div>
        </div>
        <Sparkles className="h-4 w-4 opacity-80" />
      </div>

      <div className="flex min-h-[430px] flex-col bg-[#f6f8fb]">
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[86%] whitespace-pre-wrap rounded-[1.1rem] px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                  msg.role === "user"
                    ? "rounded-br-md text-white"
                    : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                )}
                style={msg.role === "user" ? { background: primaryColor } : undefined}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {!messages.length && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4 text-center text-sm text-slate-500">
              Send a message to test how shoppers will experience the widget.
            </div>
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-500 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="sr-only" aria-live="polite">
            Assistant is typing
          </div>
        )}

        {messages.length <= 1 && suggestedQuestions.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-t border-slate-200 bg-white px-3 py-2">
            {suggestedQuestions.slice(0, 4).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 border-t border-slate-200 bg-white p-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask a question..."
            disabled={loading}
            className="h-11 rounded-2xl border-slate-200 bg-slate-50"
          />
          <Button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            size="icon"
            className="h-11 w-11 shrink-0 rounded-2xl"
            style={{ background: primaryColor }}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
