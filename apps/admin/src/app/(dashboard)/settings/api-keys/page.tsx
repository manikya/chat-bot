"use client";

import { useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ApiKeysPage() {
  const [key, setKey] = useState<string | null>(null);
  const [embed, setEmbed] = useState<string | null>(null);
  const [prefix] = useState("pk_live_abc");

  const regenerate = async () => {
    const res = await api.tenant.regenerateWidgetKey();
    setKey(res.data.apiKey);
    setEmbed((res.data as { embedCode?: string }).embedCode ?? null);
    toast.success("New API key generated — copy it now");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API keys</h1>
        <p className="text-muted-foreground">Widget public key for your storefront embed</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Widget API key</CardTitle>
          <CardDescription>Used in your embed script. Public by design — rate limited per key.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <code className="block rounded-lg bg-muted p-3 text-sm">{key ?? `${prefix}••••••••`}</code>
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
              <p className="text-sm font-medium">Embed snippet</p>
              <pre className="rounded-lg bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap">{embed}</pre>
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
          <p className="text-xs text-muted-foreground">Paste the embed snippet on your storefront before the closing &lt;/body&gt; tag.</p>
        </CardContent>
      </Card>
    </div>
  );
}
