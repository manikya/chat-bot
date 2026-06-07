"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

export default function OnboardingKnowledgePage() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const [url, setUrl] = useState("https://acme-shoes.com");
  const [crawling, setCrawling] = useState(false);
  const [progress, setProgress] = useState(0);

  const crawl = async () => {
    setCrawling(true);
    setProgress(20);
    const src = await api.knowledge.createSource({ type: "website", name: "Main website", config: { url } });
    setProgress(50);
    await api.knowledge.syncSource(src.data.sourceId);
    const interval = setInterval(() => setProgress((p) => Math.min(p + 15, 95)), 400);
    setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      setCrawling(false);
      toast.success("Website crawled successfully");
    }, 2000);
  };

  const next = async () => {
    await api.onboarding.advanceStep("catalog");
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
          <div className="space-y-2"><Label>Website URL</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} /></div>
          <Button onClick={crawl} disabled={crawling}>
            {crawling ? <><Loader2 className="h-4 w-4 animate-spin" /> Crawling...</> : "Crawl my site"}
          </Button>
          {crawling && <Progress value={progress} />}
          <div className="flex gap-2 pt-2">
            <Button onClick={next} disabled={crawling && progress < 100}>Continue</Button>
            <Button variant="outline" onClick={next}>Skip</Button>
          </div>
        </CardContent>
      </Card>
    </OnboardingShell>
  );
}
