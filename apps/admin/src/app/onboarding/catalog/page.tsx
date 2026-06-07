"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { pollIngestJob } from "@/lib/poll-job";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function OnboardingCatalogPage() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);
  const [productCount, setProductCount] = useState<number | null>(null);

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
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file");
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
      <Card>
        <CardHeader>
          <CardTitle>Product catalog</CardTitle>
          <CardDescription>Upload a CSV of products (optional)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <div
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center cursor-pointer hover:bg-muted/40 transition-colors"
            onClick={() => !uploading && inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <Upload className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Drag & drop products.csv or click to browse
            </p>
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
          <div className="flex gap-2">
            <Button onClick={() => next()} disabled={uploading}>
              Continue
            </Button>
            <Button variant="outline" onClick={() => next(true)} disabled={uploading}>
              Skip
            </Button>
          </div>
          {uploadDone && productCount != null && (
            <p className="text-sm text-muted-foreground">
              {productCount} products indexed. Continue to test chat.
            </p>
          )}
        </CardContent>
      </Card>
    </OnboardingShell>
  );
}
