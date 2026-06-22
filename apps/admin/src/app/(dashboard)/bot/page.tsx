"use client";

import { useEffect, useState } from "react";
import { Bot, MessageSquare, Palette, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Tenant, TenantConfig } from "@commercechat/mock-api";
import { ChatSimulator } from "@/components/chat/chat-simulator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SplitPageSkeleton } from "@/components/layout/page-skeleton";
import { IconFrame, MetricTile, PageIntro, SectionHeader } from "@/components/layout/admin-page";

export default function BotConfigPage() {
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.tenant.getConfig().then((r) => setConfig(r.data ?? null));
    api.tenant.getMe().then((r) => setTenant(r.data ?? null));
  }, []);

  if (!config) return <SplitPageSkeleton />;

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
      <PageIntro
        eyebrow="Assistant behavior"
        title="Tune the voice shoppers hear before the bot takes action."
        description="Prompt, greeting, channel coverage, widget suggestions, and simulator stay together so tone changes can be tested before going live."
        action={<Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Primary LLM" value={config.llmConfig.primaryProvider} detail="router provider" icon={<Sparkles className="h-4 w-4" />} />
        <MetricTile label="Channels" value={config.enabledChannels.length} detail={config.enabledChannels.join(", ")} icon={<MessageSquare className="h-4 w-4" />} />
        <MetricTile label="Suggestions" value={config.widgetConfig.suggestedQuestions.length} detail="widget chips" icon={<Bot className="h-4 w-4" />} />
        <MetricTile label="Theme" value={config.widgetConfig.primaryColor} detail={config.widgetConfig.position} icon={<Palette className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <SectionHeader
              eyebrow="Voice control"
              title="Prompts"
              description="Keep responses concise, multilingual, and commerce-aware without changing the orchestration code."
            />
            <Badge variant="success">active</Badge>
          </CardHeader>
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
            <CardTitle className="flex items-center gap-3">
              <IconFrame>
                <Bot className="h-4 w-4" />
              </IconFrame>
              Test simulator
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChatSimulator
              greeting={config.prompts.greeting}
              suggestedQuestions={config.widgetConfig.suggestedQuestions}
              storeName={tenant?.storeName ?? "Store assistant"}
              primaryColor={config.widgetConfig.primaryColor}
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
