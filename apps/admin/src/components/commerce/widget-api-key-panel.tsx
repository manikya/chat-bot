"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Key } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Props = {
  description?: string;
};

export function WidgetApiKeyPanel({ description }: Props) {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reveal = async () => {
    setBusy(true);
    try {
      const res = await api.tenant.regenerateWidgetKey();
      setKey(res.data.apiKey);
      toast.success("API key ready — copy it now");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not get API key");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <Label className="flex items-center gap-1.5 text-sm">
        <Key className="h-3.5 w-3.5" />
        Widget API key
      </Label>
      <p className="text-xs text-muted-foreground">
        {description ??
          "Paste this key in the CommerceChat app inside Shopify Admin after you install it."}
      </p>
      {key ? (
        <code className="block rounded bg-muted p-2 text-xs break-all">{key}</code>
      ) : (
        <p className="text-xs text-muted-foreground">
          Already have your key from{" "}
          <Link href="/settings/api-keys" className="underline">
            Settings → API keys
          </Link>
          ? Use that in Shopify — or generate one below.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {key && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(key);
              toast.success("Copied");
            }}
          >
            <Copy className="h-4 w-4" />
            Copy key
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={reveal}>
          {key ? "Regenerate key" : "Show / copy API key"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Regenerating creates a new key and invalidates the previous one.
      </p>
    </div>
  );
}
