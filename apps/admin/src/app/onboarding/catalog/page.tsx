"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { pollIngestJob } from "@/lib/poll-job";
import { WooCommerceConnectCard } from "@/components/onboarding/woocommerce-connect-card";
import { ShopifyConnectCard } from "@/components/onboarding/shopify-connect-card";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function OnboardingCatalogPage() {
  const router = useRouter();
  const { tenant, refreshMe } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);
  const [productCount, setProductCount] = useState<number | null>(null);
  const [wooConnected, setWooConnected] = useState(false);
  const [shopifyConnected, setShopifyConnected] = useState(false);

  useEffect(() => {
    api.commerce
      .wordpressStatus()
      .then((r) => setWooConnected(Boolean(r.data.connected)))
      .catch(() => setWooConnected(false));
    api.commerce
      .shopifyStatus()
      .then((r) => setShopifyConnected(Boolean(r.data.connected)))
      .catch(() => setShopifyConnected(false));
  }, []);

  const upload = async (file: File) => {
    setUploading(true);
    setProgress(10);
    setUploadDone(false);
    try {
      const source = await api.knowledge.createCatalogSource(file, "Product catalog");
      setProgress(30);
      const sync = await api.knowledge.syncSource(source.data.sourceId);
      const job = await pollIngestJob(sync.data.jobId, (j) => {
        setProgress(j.progressPct ?? (j.status === "running" ? 50 : 20));
      });
      setProgress(100);
      setUploadDone(true);
      const count = job.stats?.chunksCreated ?? job.stats?.pagesProcessed ?? 0;
      setProductCount(count);
      toast.success(`Imported ${count} products`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".json")) {
      toast.error("Upload a CSV or JSON catalog file");
      return;
    }
    if (lower.endsWith(".json")) {
      toast.message("JSON catalogs are imported as CSV — use the sample format or WooCommerce sync");
      return;
    }
    void upload(file);
  };

  const next = async (skip = false) => {
    await api.onboarding.advanceStep("test", skip);
    await refreshMe();
    router.push("/onboarding/test");
  };

  return (
    <OnboardingShell currentStep="catalog">
      <div className="space-y-4">
        {(wooConnected || shopifyConnected) && (
          <Card className="border-emerald-200 bg-emerald-50/40">
            <CardContent className="pt-6">
              <p className="text-sm">
                {wooConnected && shopifyConnected
                  ? "Your store is connected — catalog sync is in progress. You can skip CSV upload."
                  : wooConnected
                    ? "WooCommerce is connected — your catalog is already syncing. You can skip CSV upload and continue to test chat."
                    : "Shopify is connected — your catalog is already syncing. You can skip CSV upload and continue to test chat."}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Product catalog</CardTitle>
            <CardDescription>
              Connect WooCommerce or Shopify to sync products automatically, or upload a CSV.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <WooCommerceConnectCard onConnected={() => setWooConnected(true)} />
            <ShopifyConnectCard onConnected={() => setShopifyConnected(true)} />

            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <div
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => !uploading && inputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              <Upload className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Drag & drop products.csv or click to browse</p>
              <Button
                variant="outline"
                className="mt-4"
                disabled={uploading}
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Importing...
                  </>
                ) : (
                  "Upload CSV"
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Required columns: sku, name, description, price, category.{" "}
              <a href="/sample-products.csv" className="underline" download>
                Download sample CSV
              </a>
            </p>
            {uploading && <Progress value={progress} />}
            {uploadDone && productCount != null && (
              <p className="text-sm text-muted-foreground">{productCount} products indexed.</p>
            )}
            <div className="flex gap-2">
              <Button onClick={() => next()} disabled={uploading}>
                Continue
              </Button>
              <Button variant="outline" onClick={() => next(true)} disabled={uploading}>
                Skip
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </OnboardingShell>
  );
}
