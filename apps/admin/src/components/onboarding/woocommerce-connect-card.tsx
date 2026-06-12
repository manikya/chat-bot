"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { pollIngestJob } from "@/lib/poll-job";
import {
  WOOCOMMERCE_PLUGIN_DOWNLOAD_URL,
  WOOCOMMERCE_PLUGIN_INSTALL_STEPS,
} from "@/lib/commerce-plugin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  defaultSiteUrl?: string;
  compact?: boolean;
  onConnected?: () => void;
};

export function WooCommerceConnectCard({ defaultSiteUrl, compact, onConnected }: Props) {
  const [siteUrl, setSiteUrl] = useState(defaultSiteUrl?.trim() || "");
  const [apiKey, setApiKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [siteLabel, setSiteLabel] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (defaultSiteUrl?.startsWith("http")) setSiteUrl(defaultSiteUrl);
  }, [defaultSiteUrl]);

  useEffect(() => {
    api.commerce
      .wordpressStatus()
      .then((r) => {
        setConnected(Boolean(r.data.connected));
        setSiteLabel(r.data.siteUrl);
      })
      .catch(() => setConnected(false));
  }, []);

  const connect = async () => {
    if (!siteUrl.trim().startsWith("http")) {
      toast.error("Enter your WordPress store URL (https://…)");
      return;
    }
    setBusy(true);
    try {
      await api.commerce.connectWordPress({ siteUrl: siteUrl.trim(), apiKey });
      const sync = await api.commerce.syncWordPress();
      await pollIngestJob(sync.data.jobId);
      setConnected(true);
      setSiteLabel(siteUrl.trim());
      setApiKey("");
      toast.success("WooCommerce connected and products synced");
      onConnected?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "WooCommerce connect failed");
    } finally {
      setBusy(false);
    }
  };

  if (connected) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="success">WooCommerce connected</Badge>
          {siteLabel && <span className="text-sm text-muted-foreground">{siteLabel}</span>}
        </div>
        {!compact && (
          <p className="text-xs text-muted-foreground">
            Products sync from your WordPress store. You can skip website crawl and CSV upload.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">WooCommerce / WordPress</p>
        <p className="text-xs text-muted-foreground">
          No public website? Install our plugin on your WordPress store to sync products and power order
          lookups — ideal for WooCommerce-only merchants.
        </p>
      </div>

      {!compact && (
        <div className="rounded-md bg-muted/50 p-3 space-y-3">
          <p className="text-xs font-medium">Setup instructions</p>
          <ol className="list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground">
            {WOOCOMMERCE_PLUGIN_INSTALL_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={WOOCOMMERCE_PLUGIN_DOWNLOAD_URL} download>
              <Download className="h-4 w-4" />
              Download plugin (.zip)
            </a>
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Label>WordPress store URL</Label>
        <Input
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
          placeholder="https://yourstore.com"
        />
      </div>
      <div className="space-y-2">
        <Label>API key</Label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="From Settings → CommerceChat in WordPress"
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy || !apiKey.trim() || !siteUrl.trim()}
        onClick={connect}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Connect WooCommerce
      </Button>
    </div>
  );
}
