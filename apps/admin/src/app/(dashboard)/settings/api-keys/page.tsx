"use client";

import { useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ApiKeysPage() {
  const [key, setKey] = useState<string | null>(null);
  const [prefix] = useState("pk_live_abc");

  const regenerate = async () => {
    const res = await api.tenant.regenerateWidgetKey();
    setKey(res.data.apiKey);
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
          <p className="text-xs text-muted-foreground">24-hour grace period applies to the previous key after rotation.</p>
        </CardContent>
      </Card>
    </div>
  );
}
