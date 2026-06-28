"use client";

import { useEffect, useState } from "react";
import type { DailySocialContent, SocialContentIdea } from "@commercechat/mock-api";
import { CalendarDays, Copy, Hash, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageIntro } from "@/components/layout/admin-page";
import { AdminPageSkeleton } from "@/components/layout/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ContentIdeasPage() {
  const [content, setContent] = useState<DailySocialContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await api.socialContent.getDaily();
      setContent(res.data ?? null);
    } catch (err) {
      setError(errorMessage(err, "Could not load content ideas"));
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api.socialContent.generateDaily();
      setContent(res.data);
      toast.success("Generated today's content ideas");
    } catch (err) {
      const message = errorMessage(err, "Could not generate content ideas");
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    api.socialContent
      .getDaily()
      .then((res) => {
        if (!cancelled) setContent(res.data ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "Could not load content ideas"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <AdminPageSkeleton cards={3} />;

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Social content"
        title="Daily product-aware post ideas."
        description="Review the same AI-generated content prompts sent by mobile push notifications, including captions, product angles, hashtags, and date context."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => load()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={generate} disabled={generating}>
              <Sparkles className="h-4 w-4" />
              {generating ? "Generating..." : "Generate today"}
            </Button>
          </div>
        }
      />

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 text-sm font-medium text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {content ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>Today&apos;s push summary</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{content.summary}</p>
                </div>
                <Badge variant={content.source === "ai" ? "success" : "secondary"}>{content.source}</Badge>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
                <Info label="Date" value={content.date} />
                <Info label="Store" value={content.storeName ?? "Store"} />
                <Info label="Timezone" value={content.timezone} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Generated
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Info label="Time" value={new Date(content.generatedAt).toLocaleString()} />
                <Info label="Ideas" value={String(content.ideas.length)} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {content.ideas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Catalog signals used</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SignalGroup title="Products" items={content.signals.products} />
              <SignalGroup title="Categories" items={content.signals.categories} />
              <SignalGroup title="Tags" items={content.signals.tags} />
              <SignalGroup title="Starter intents" items={content.signals.starterIntents} />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Sparkles className="h-8 w-8 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">No ideas generated yet</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Generate today&apos;s ideas now, or wait for the daily morning schedule to create and push them.
              </p>
            </div>
            <Button onClick={generate} disabled={generating}>
              <Sparkles className="h-4 w-4" />
              {generating ? "Generating..." : "Generate today"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function IdeaCard({ idea }: { idea: SocialContentIdea }) {
  const copyCaption = async () => {
    await navigator.clipboard.writeText(`${idea.captionIdea}\n\n${idea.hashtags.join(" ")}`.trim());
    toast.success("Caption copied");
  };

  return (
    <Card className="flex min-h-[280px] flex-col">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-snug">{idea.title}</CardTitle>
          <Badge variant="secondary">{idea.suggestedFormat}</Badge>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-primary">{idea.productAngle}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <p className="text-sm leading-relaxed">{idea.captionIdea}</p>
        <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {idea.whyToday}
        </p>
        {idea.hashtags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {idea.hashtags.slice(0, 8).map((tag) => (
              <Badge key={tag} variant="outline" className="gap-1">
                <Hash className="h-3 w-3" />
                {tag.replace(/^#/, "")}
              </Badge>
            ))}
          </div>
        ) : null}
        <Button variant="outline" size="sm" className="mt-auto justify-center" onClick={copyCaption}>
          <Copy className="h-3.5 w-3.5" />
          Copy caption
        </Button>
      </CardContent>
    </Card>
  );
}

function SignalGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.length ? (
          items.slice(0, 10).map((item) => (
            <Badge key={item} variant="secondary">
              {item}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">None yet</span>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/60 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function errorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? fallback);
  }
  return fallback;
}
