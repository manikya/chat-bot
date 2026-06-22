"use client";

import { useState } from "react";
import { Code2, Copy, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconFrame, MetricTile, PageIntro, SectionHeader } from "@/components/layout/admin-page";

export default function ApiKeysPage() {
  const [key, setKey] = useState<string | null>(null);
  const [embed, setEmbed] = useState<string | null>(null);

  const regenerate = async () => {
    const res = await api.tenant.regenerateWidgetKey();
    setKey(res.data.apiKey);
    setEmbed(res.data.embedCode ?? null);
    toast.success("New API key generated — copy it now");
  };

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Storefront access"
        title="Manage the public widget key used by storefront embeds."
        description="The widget key is public by design, rate limited per tenant, and should be regenerated when rotating storefront snippets."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricTile label="Widget key" value={key ? "ready" : "hidden"} detail="copy after regenerate" icon={<KeyRound className="h-4 w-4" />} />
        <MetricTile label="Embed" value={embed ? "ready" : "pending"} detail="script snippet" icon={<Code2 className="h-4 w-4" />} />
        <MetricTile label="Exposure" value="public" detail="rate limited" icon={<ShieldCheck className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
          <CardTitle className="flex items-center gap-3">
            <IconFrame>
              <KeyRound className="h-4 w-4" />
            </IconFrame>
            Widget API key
          </CardTitle>
          <CardDescription>Used in your embed script. Public by design — rate limited per key.</CardDescription>
          </div>
          <Badge variant={key ? "success" : "secondary"}>{key ? "generated" : "not shown"}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <code className="block rounded-lg border bg-muted p-3 text-sm">
            {key ?? "Click regenerate to view your key"}
          </code>
          <div className="flex gap-2">
            {key && (
              <Button variant="outline" onClick={() => { navigator.clipboard.writeText(key); toast.success("Copied"); }}>
                <Copy className="h-4 w-4" /> Copy
              </Button>
            )}
            <Button variant="outline" onClick={regenerate}>
              <RefreshCw className="h-4 w-4" /> Regenerate key
            </Button>
          </div>
          {embed && (
            <div className="space-y-2">
              <SectionHeader
                eyebrow="Install snippet"
                title="Embed snippet"
                description="Paste before the closing body tag on your storefront."
              />
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border bg-muted p-3 text-xs">{embed}</pre>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(embed);
                  toast.success("Embed code copied");
                }}
              >
                <Copy className="h-4 w-4" /> Copy embed code
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Paste the embed snippet on your storefront before the closing &lt;/body&gt; tag.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
