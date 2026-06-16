"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { pollIngestJob } from "@/lib/poll-job";
import {
  SHOPIFY_APP_INSTALL_STEPS,
  normalizeShopDomain,
  shopifyAppInstallUrl,
} from "@/lib/commerce-plugin";
import { WidgetApiKeyPanel } from "@/components/commerce/widget-api-key-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  defaultStoreUrl?: string;
  compact?: boolean;
  manageActions?: boolean;
  onConnected?: () => void;
  onStatusChange?: () => void;
};

export function ShopifyConnectCard({
  defaultStoreUrl,
  compact,
  manageActions,
  onConnected,
  onStatusChange,
}: Props) {
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>();
  const [shopLabel, setShopLabel] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refreshStatus = useCallback(() => {
    return api.commerce
      .shopifyStatus()
      .then((r) => {
        const isConnected = Boolean(r.data.connected);
        setConnected(isConnected);
        setShopLabel(r.data.shopDomain);
        setLastSyncAt(r.data.lastSyncAt);
        if (r.data.shopDomain) setShopDomain(r.data.shopDomain);
        if (isConnected) onConnected?.();
        return isConnected;
      })
      .catch(() => {
        setConnected(false);
        return false;
      });
  }, [onConnected]);

  useEffect(() => {
    const guessed = defaultStoreUrl ? normalizeShopDomain(defaultStoreUrl) : "";
    if (guessed) setShopDomain(guessed);
  }, [defaultStoreUrl]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const connectManual = async () => {
    if (!shopDomain.trim()) {
      toast.error("Enter your Shopify shop domain (your-store.myshopify.com)");
      return;
    }
    setBusy(true);
    try {
      await api.commerce.connectShopify({
        shopDomain: shopDomain.trim(),
        accessToken: accessToken.trim(),
      });
      const sync = await api.commerce.syncShopify();
      await pollIngestJob(sync.data.jobId, () => {});
      await refreshStatus();
      setAccessToken("");
      toast.success("Shopify connected and products synced");
      onStatusChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Shopify connect failed");
    } finally {
      setBusy(false);
    }
  };

  const syncProducts = async () => {
    setSyncing(true);
    try {
      const sync = await api.commerce.syncShopify();
      await pollIngestJob(sync.data.jobId, () => {});
      await refreshStatus();
      toast.success("Shopify sync completed");
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
      await api.commerce.disconnectShopify();
      await refreshStatus();
      toast.success("Shopify disconnected");
      onStatusChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  };

  const installUrl = shopifyAppInstallUrl(shopDomain);
  const normalizedShop = normalizeShopDomain(shopDomain);

  if (connected) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="success">Shopify connected</Badge>
          {shopLabel && <span className="text-sm text-muted-foreground">{shopLabel}</span>}
        </div>
        {!compact && (
          <p className="text-xs text-muted-foreground">
            Products sync from your Shopify store. You can skip website crawl and CSV upload.
          </p>
        )}
        {lastSyncAt && (
          <p className="text-xs text-muted-foreground">
            Last sync {new Date(lastSyncAt).toLocaleString()}
          </p>
        )}
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

  const customDomainHint =
    defaultStoreUrl && !normalizeShopDomain(defaultStoreUrl)
      ? "Your storefront uses a custom domain — enter the .myshopify.com address from Shopify Admin → Settings → Domains."
      : null;

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">CommerceChat Shopify app</p>
        <p className="text-xs text-muted-foreground">
          Install our Shopify app to sync products, enable order lookups, and add the chat widget — paste
          your widget API key during setup.
        </p>
      </div>

      {!compact && (
        <div className="rounded-md bg-muted/50 p-3 space-y-3">
          <p className="text-xs font-medium">Setup steps</p>
          <ol className="list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground">
            {SHOPIFY_APP_INSTALL_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      <WidgetApiKeyPanel />

      {customDomainHint && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
          {customDomainHint}
        </p>
      )}

      <div className="space-y-2">
        <Label>Shop domain</Label>
        <Input
          value={shopDomain}
          onChange={(e) => setShopDomain(e.target.value)}
          placeholder="your-store.myshopify.com"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {normalizedShop ? (
          <Button type="button" size="sm" asChild>
            <a href={installUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Install in Shopify
            </a>
          </Button>
        ) : (
          <Button type="button" size="sm" disabled>
            <ExternalLink className="h-4 w-4" />
            Install in Shopify
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => void refreshStatus()}>
          <RefreshCw className="h-4 w-4" />
          Refresh status
        </Button>
      </div>

      {!normalizedShop && shopDomain.trim() && (
        <p className="text-xs text-muted-foreground">
          Enter your <code className="text-[11px]">.myshopify.com</code> domain to enable install.
        </p>
      )}

      <div className="border-t pt-3 space-y-3">
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide" : "Advanced"}: connect with Admin API token (developer)
        </button>
        {showAdvanced && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Admin API access token</Label>
              <Input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="shpat_… from a Shopify custom app"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !accessToken.trim() || !shopDomain.trim()}
              onClick={connectManual}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Connect with token
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
