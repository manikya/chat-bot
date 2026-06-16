"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";

type Props = {
  defaultSiteUrl?: string;
  compact?: boolean;
  manageActions?: boolean;
  onConnected?: () => void;
  onStatusChange?: () => void;
};

export function WooCommerceConnectCard({
  defaultSiteUrl,
  compact,
  manageActions,
  onConnected,
  onStatusChange,
}: Props) {
  const [siteUrl, setSiteUrl] = useState(defaultSiteUrl?.trim() || "");
  const [apiKey, setApiKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [siteLabel, setSiteLabel] = useState<string | undefined>();
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [widgetEnabled, setWidgetEnabled] = useState(true);
  const [widgetToggling, setWidgetToggling] = useState(false);
  const widgetConfigSynced = useRef(false);

  const refreshStatus = useCallback(() => {
    return api.commerce
      .wordpressStatus()
      .then((r) => {
        const isConnected = Boolean(r.data.connected);
        setConnected(isConnected);
        setSiteLabel(r.data.siteUrl);
        setLastSyncAt(r.data.lastSyncAt);
        setWidgetEnabled(r.data.widgetEnabled !== false);
        if (isConnected) onConnected?.();
        return isConnected;
      })
      .catch(() => {
        setConnected(false);
        return false;
      });
  }, [onConnected]);

  useEffect(() => {
    if (defaultSiteUrl?.startsWith("http")) setSiteUrl(defaultSiteUrl);
  }, [defaultSiteUrl]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!connected || widgetConfigSynced.current) return;
    widgetConfigSynced.current = true;
    void api.commerce.setWordPressWidgetEnabled(widgetEnabled).catch(() => {
      widgetConfigSynced.current = false;
    });
  }, [connected, widgetEnabled]);

  const connect = async () => {
    if (!siteUrl.trim().startsWith("http")) {
      toast.error("Enter your WordPress store URL (https://…)");
      return;
    }
    setBusy(true);
    try {
      await api.commerce.connectWordPress({ siteUrl: siteUrl.trim(), apiKey });
      const sync = await api.commerce.syncWordPress();
      await pollIngestJob(sync.data.jobId, () => {});
      setConnected(true);
      setSiteLabel(siteUrl.trim());
      setApiKey("");
      setWidgetEnabled(true);
      widgetConfigSynced.current = false;
      toast.success("WooCommerce connected and products synced");
      onConnected?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "WooCommerce connect failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleWidget = async (enabled: boolean) => {
    setWidgetToggling(true);
    try {
      await api.commerce.setWordPressWidgetEnabled(enabled);
      setWidgetEnabled(enabled);
      toast.success(enabled ? "Chat widget enabled on storefront" : "Chat widget disabled");
      onStatusChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update widget setting");
      void refreshStatus();
    } finally {
      setWidgetToggling(false);
    }
  };

  const syncProducts = async () => {
    setSyncing(true);
    try {
      const sync = await api.commerce.syncWordPress();
      await pollIngestJob(sync.data.jobId, () => onStatusChange?.());
      await refreshStatus();
      toast.success("WooCommerce sync completed");
      onStatusChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await api.commerce.disconnectWordPress();
      await refreshStatus();
      toast.success("WooCommerce disconnected");
      onStatusChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  };

  if (connected) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="success">WooCommerce connected</Badge>
          {siteLabel && <span className="text-sm text-muted-foreground">{siteLabel}</span>}
        </div>
        {!compact && (
          <p className="text-xs text-muted-foreground">
            Products sync automatically when your catalog changes in WordPress.
          </p>
        )}
        {lastSyncAt && (
          <p className="text-xs text-muted-foreground">
            Last sync {new Date(lastSyncAt).toLocaleString()}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 rounded-md border bg-background/80 px-3 py-2">
          <div className="space-y-0.5">
            <Label htmlFor="woocommerce-widget-toggle" className="text-sm font-medium">
              Chat widget on storefront
            </Label>
            <p className="text-xs text-muted-foreground">
              Off hides the bubble on your store; products still sync.
            </p>
          </div>
          <Switch
            id="woocommerce-widget-toggle"
            checked={widgetEnabled}
            disabled={widgetToggling}
            onCheckedChange={(checked) => void toggleWidget(checked)}
          />
        </div>
        {manageActions && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={syncProducts} disabled={syncing}>
              {syncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Sync products
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={disconnect} disabled={busy}>
              Disconnect
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">WooCommerce / WordPress</p>
        <p className="text-xs text-muted-foreground">
          Install our plugin on WordPress to sync products, enable order lookups, and show the web chat
          widget — one API key, no theme code edits.
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
