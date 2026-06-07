"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { pollIngestJob } from "@/lib/poll-job";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

export default function OnboardingKnowledgePage() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const [url, setUrl] = useState("https://example.com");
  const [crawling, setCrawling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [crawlDone, setCrawlDone] = useState(false);

  const crawl = async () => {
    setCrawling(true);
    setProgress(5);
    setCrawlDone(false);
    try {
      const src = await api.knowledge.createSource({
        type: "website",
        name: "Main website",
        config: { url, maxDepth: 2, maxPages: 20 },
      });
      const sync = await api.knowledge.syncSource(src.data.sourceId);
      await pollIngestJob(sync.data.jobId, (job) => {
        setProgress(job.progressPct ?? (job.status === "running" ? 50 : 10));
      });
      setProgress(100);
      setCrawlDone(true);
      toast.success("Website crawled successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Crawl failed");
    } finally {
      setCrawling(false);
    }
  };

  const next = async (skip = false) => {
    await api.onboarding.advanceStep("catalog", skip);
    await refreshMe();
    router.push("/onboarding/catalog");
  };

  return (
    <OnboardingShell currentStep="knowledge">
      <Card>
        <CardHeader>
          <CardTitle>Add your website</CardTitle>
          <CardDescription>We&apos;ll crawl your site so the bot can answer questions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Website URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} disabled={crawling} />
          </div>
          <Button onClick={crawl} disabled={crawling}>
            {crawling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Crawling...
              </>
            ) : (
              "Crawl my site"
            )}
          </Button>
          {crawling && <Progress value={progress} />}
          <div className="flex gap-2 pt-2">
            <Button onClick={() => next()} disabled={crawling || (!crawlDone && progress < 100)}>
              Continue
            </Button>
            <Button variant="outline" onClick={() => next(true)} disabled={crawling}>
              Skip
            </Button>
          </div>
        </CardContent>
      </Card>
    </OnboardingShell>
  );
}
