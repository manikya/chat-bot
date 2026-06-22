"use client";

import { useState } from "react";
import { Loader2, MoreVertical, Send } from "lucide-react";
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
  const [showDisclaimer, setShowDisclaimer] = useState(false);

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
    <div className={cn("overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl", className)}>
      <div className="grid h-14 grid-cols-[36px_1fr_36px] items-center px-3.5 text-slate-950">
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100" aria-label="Chat menu">
          <MoreVertical className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center justify-center">
          <p className="truncate text-[17px] font-bold">{storeName}</p>
        </div>
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-2xl hover:bg-slate-100" aria-label="Minimize preview">
          −
        </button>
      </div>
      <div className="h-[3px] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-teal-300" />

      <div className="flex min-h-[650px] flex-col bg-white">
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[82%] whitespace-pre-wrap rounded-xl px-4 py-3 text-[15px] leading-relaxed",
                  msg.role === "user"
                    ? "bg-slate-100 text-slate-950"
                    : "relative pl-12 text-slate-950"
                )}
              >
                {msg.role === "assistant" && (
                  <span
                    className="absolute left-0 top-2 flex h-8 w-8 items-center justify-center rounded-full text-sm text-white"
                    style={{ background: `linear-gradient(135deg, ${primaryColor}, #7c3aed)` }}
                  >
                    ✦
                  </span>
                )}
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
              <div className="relative flex items-center gap-2 rounded-xl pl-12 pr-4 py-3 text-sm text-slate-500">
                <span
                  className="absolute left-0 top-2 flex h-8 w-8 items-center justify-center rounded-full text-sm text-white"
                  style={{ background: `linear-gradient(135deg, ${primaryColor}, #7c3aed)` }}
                >
                  ✦
                </span>
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
          <div className="flex flex-col items-start gap-2 bg-white px-6 pb-5 pt-1">
            <p className="mb-0.5 text-sm font-bold text-slate-700">Want help getting started?</p>
            <p className="-mt-1 mb-1 text-[13px] font-medium text-slate-500">Choose a question or type your own.</p>
            {suggestedQuestions.slice(0, 4).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                className="max-w-full rounded-[9px] border-2 border-violet-500 bg-white px-4 py-3 text-left text-[15px] font-medium text-slate-950 transition hover:bg-violet-50"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-slate-200 bg-white px-6 pb-2 pt-5">
          <div className="relative">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder="Ask a question..."
              disabled={loading}
              className="h-12 rounded-[10px] border-2 border-slate-900 bg-white pr-12 text-base font-medium"
            />
            <Button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              size="icon"
              className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-slate-400 hover:bg-slate-500"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="bg-white px-6 pb-5 text-center text-xs font-semibold text-slate-600">
          By chatting, you agree to this{" "}
          <button type="button" onClick={() => setShowDisclaimer(true)} className="font-bold text-blue-600">
            disclaimer
          </button>
        </div>
      </div>
      {showDisclaimer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-6">
          <div className="w-full max-w-lg overflow-hidden rounded-[1.35rem] bg-white text-slate-950 shadow-2xl">
            <div className="flex items-center justify-between gap-4 px-7 pb-3 pt-7">
              <h2 className="text-3xl font-extrabold tracking-tight">Disclaimer</h2>
              <button
                type="button"
                onClick={() => setShowDisclaimer(false)}
                className="text-4xl leading-none text-slate-700"
                aria-label="Close disclaimer"
              >
                ×
              </button>
            </div>
            <div className="px-7 pb-7 text-[17px] leading-relaxed text-slate-800">
              By chatting, you agree to our{" "}
              <a href="/legal/site-terms" target="_blank" rel="noreferrer" className="font-bold text-blue-600">
                Site Terms
              </a>
              ,{" "}
              <a href="/legal/acceptable-use" target="_blank" rel="noreferrer" className="font-bold text-blue-600">
                Acceptable Use Policy
              </a>{" "}
              and{" "}
              <a href="/legal/responsible-ai" target="_blank" rel="noreferrer" className="font-bold text-blue-600">
                Responsible AI Policy
              </a>
              . Your information is handled as described in our{" "}
              <a href="/legal/privacy-notice" target="_blank" rel="noreferrer" className="font-bold text-blue-600">
                Privacy Notice
              </a>
              . Inputs you provide and
              outputs generated through this chatbot may be used to provide, support, and improve the service.
            </div>
            <div className="flex justify-end border-t border-slate-200 px-7 py-5">
              <button
                type="button"
                onClick={() => setShowDisclaimer(false)}
                className="rounded-full bg-slate-950 px-8 py-3 text-base font-extrabold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
