"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { TenantConfig } from "@commercechat/mock-api";
import { ChatSimulator } from "@/components/chat/chat-simulator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function BotConfigPage() {
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.tenant.getConfig().then((r) => setConfig(r.data ?? null));
  }, []);

  if (!config) return <div>Loading...</div>;

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.tenant.updateConfig(config);
      setConfig(res.data ?? config);
      toast.success("Bot configuration saved");
    } catch {
      toast.error("Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bot configuration</h1>
          <p className="text-muted-foreground">Customize how your assistant greets and replies to customers</p>
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Prompts</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Customers may write in English, Sinhala, Tamil, or Singlish. The system prompt should tell the bot to
              reply in their language. New stores with timezone Asia/Colombo get Sri Lanka defaults at signup.
            </p>
            <div className="space-y-2">
              <Label>System prompt</Label>
              <Textarea
                rows={5}
                value={config.prompts.systemPrompt}
                onChange={(e) => setConfig({ ...config, prompts: { ...config.prompts, systemPrompt: e.target.value } })}
              />
            </div>
            <div className="space-y-2">
              <Label>Greeting message</Label>
              <Input
                value={config.prompts.greeting}
                onChange={(e) => setConfig({ ...config, prompts: { ...config.prompts, greeting: e.target.value } })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test simulator</CardTitle>
          </CardHeader>
          <CardContent>
            <ChatSimulator
              greeting={config.prompts.greeting}
              suggestedQuestions={config.widgetConfig.suggestedQuestions}
              onSend={async (msg) => {
                const res = await api.chat.send(msg);
                return res.data.reply.content;
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
