"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { pollIngestJob } from "@/lib/poll-job";
import { WooCommerceConnectCard } from "@/components/onboarding/woocommerce-connect-card";
import { ShopifyConnectCard } from "@/components/onboarding/shopify-connect-card";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

type StorePlatform = "woocommerce" | "shopify" | "generic";
type PageMode = "url" | "no-website";

type FaqRow = { question: string; answer: string };

export default function OnboardingKnowledgePage() {
  const router = useRouter();
  const { tenant, refreshMe } = useAuth();
  const [mode, setMode] = useState<PageMode>("url");
  const [url, setUrl] = useState(tenant?.websiteUrl ?? "");
  const [detecting, setDetecting] = useState(false);
  const [platform, setPlatform] = useState<StorePlatform | null>(null);
  const [detectedUrl, setDetectedUrl] = useState("");
  const [pluginInstalled, setPluginInstalled] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [crawlDone, setCrawlDone] = useState(false);
  const [wooReady, setWooReady] = useState(false);
  const [shopifyReady, setShopifyReady] = useState(false);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [faqSourceId, setFaqSourceId] = useState<string | null>(null);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [faqSaving, setFaqSaving] = useState(false);

  const loadFaqs = useCallback(async () => {
    try {
      const res = await api.knowledge.listFaq();
      setFaqs(res.data.items ?? []);
      setFaqSourceId(res.data.sourceId ?? null);
    } catch {
      setFaqs([]);
      setFaqSourceId(null);
    }
  }, []);

  useEffect(() => {
    if (tenant?.websiteUrl?.startsWith("http")) setUrl(tenant.websiteUrl);
  }, [tenant?.websiteUrl]);

  useEffect(() => {
    api.commerce
      .wordpressStatus()
      .then((r) => setWooReady(Boolean(r.data.connected)))
      .catch(() => setWooReady(false));
    api.commerce
      .shopifyStatus()
      .then((r) => setShopifyReady(Boolean(r.data.connected)))
      .catch(() => setShopifyReady(false));
    void loadFaqs();
    api.knowledge.listSources().then((r) => {
      const hasWebsite = r.data.items.some((s) => s.type === "website" && s.status === "active");
      if (hasWebsite) setCrawlDone(true);
    });
  }, [loadFaqs]);

  const crawlSite = async (crawlUrl: string) => {
    const trimmed = crawlUrl.trim();
    if (!trimmed.startsWith("http")) {
      toast.error("Enter a valid store URL");
      return;
    }
    setCrawling(true);
    setProgress(5);
    setCrawlDone(false);
    try {
      const src = await api.knowledge.createSource({
        type: "website",
        name: "Main website",
        config: { url: trimmed, maxDepth: 2, maxPages: 20 },
      });
      const sync = await api.knowledge.syncSource(src.data.sourceId);
      await pollIngestJob(sync.data.jobId, (job) => {
        setProgress(job.progressPct ?? (job.status === "running" ? 50 : 10));
      });
      setProgress(100);
      setCrawlDone(true);
      toast.success("Website indexed successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Crawl failed");
    } finally {
      setCrawling(false);
    }
  };

  const analyzeUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("Enter your store or website URL");
      return;
    }
    setDetecting(true);
    setPlatform(null);
    try {
      const res = await api.knowledge.detectPlatform(trimmed);
      const data = res.data;
      setPlatform(data.platform);
      setDetectedUrl(data.normalizedUrl);
      setPluginInstalled(Boolean(data.commerceChatPluginInstalled));
      setUrl(data.normalizedUrl);

      if (data.platform === "generic") {
        await crawlSite(data.normalizedUrl);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not analyze URL");
    } finally {
      setDetecting(false);
    }
  };

  const addFaq = async () => {
    if (!faqQuestion.trim() || !faqAnswer.trim()) return;
    setFaqSaving(true);
    try {
      const res = await api.knowledge.ingestFaq(
        [{ question: faqQuestion.trim(), answer: faqAnswer.trim() }],
        true
      );
      setFaqs(res.data.items ?? []);
      setFaqSourceId(res.data.sourceId ?? null);
      setFaqQuestion("");
      setFaqAnswer("");
      toast.success("FAQ added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "FAQ save failed");
    } finally {
      setFaqSaving(false);
    }
  };

  const removeFaq = async (index: number) => {
    const next = faqs.filter((_, i) => i !== index);
    try {
      if (next.length === 0 && faqSourceId) {
        await api.knowledge.deleteSource(faqSourceId);
        setFaqSourceId(null);
      } else if (next.length > 0) {
        const res = await api.knowledge.ingestFaq(next, false);
        setFaqs(res.data.items ?? next);
        setFaqSourceId(res.data.sourceId ?? faqSourceId);
      }
      setFaqs(next);
      toast.success("FAQ removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove FAQ");
    }
  };

  const canContinue = crawlDone || wooReady || shopifyReady || faqs.length > 0;

  const next = async (skip = false) => {
    await api.onboarding.advanceStep("catalog", skip);
    await refreshMe();
    router.push("/onboarding/catalog");
  };

  const platformLabel =
    platform === "woocommerce"
      ? "WooCommerce / WordPress"
      : platform === "shopify"
        ? "Shopify"
        : platform === "generic"
          ? "Website"
          : null;

  return (
    <OnboardingShell currentStep="knowledge">
      <div className="space-y-4">
        {mode === "url" && (
          <Card>
            <CardHeader>
              <CardTitle>Store or website URL</CardTitle>
              <CardDescription>
                We&apos;ll detect WooCommerce or Shopify and guide you to the right setup — otherwise we&apos;ll
                crawl public pages.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="store-url">Page URL</Label>
                <Input
                  id="store-url"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setPlatform(null);
                  }}
                  disabled={detecting || crawling}
                  placeholder="https://yourstore.com"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={analyzeUrl} disabled={detecting || crawling || !url.trim()}>
                  {detecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Checking...
                    </>
                  ) : (
                    "Check store"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={detecting || crawling}
                  onClick={() => {
                    setMode("no-website");
                    void loadFaqs();
                  }}
                >
                  I don&apos;t have a website
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {mode === "no-website" && (
          <Card>
            <CardHeader>
              <CardTitle>No website</CardTitle>
              <CardDescription>
                Add FAQs your customers often ask. You can connect WooCommerce or upload a catalog in the next
                steps.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={() => setMode("url")}>
                ← I have a store URL
              </Button>
            </CardContent>
          </Card>
        )}

        {platform && mode === "url" && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Detected: {platformLabel}</CardTitle>
                <Badge variant="secondary">{detectedUrl}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {platform === "woocommerce" && (
                <>
                  {pluginInstalled ? (
                    <p className="text-sm text-emerald-700">
                      CommerceChat Connector is already installed on this store — enter your API key below to
                      connect.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Install the CommerceChat Connector plugin on WordPress to sync products and enable order
                      lookups.
                    </p>
                  )}
                  <WooCommerceConnectCard
                    defaultSiteUrl={detectedUrl}
                    onConnected={() => setWooReady(true)}
                  />
                </>
              )}

              {platform === "shopify" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    We detected a Shopify storefront — copy your widget API key, install the CommerceChat
                    Shopify app, and paste the key when prompted.
                  </p>
                  <ShopifyConnectCard
                    defaultStoreUrl={detectedUrl}
                    onConnected={() => setShopifyReady(true)}
                  />
                  <div className="border-t pt-4 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Don&apos;t have API access yet? You can index public storefront pages as a fallback.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={crawling || crawlDone || shopifyReady}
                      onClick={() => crawlSite(detectedUrl)}
                    >
                      {crawling ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Crawling storefront...
                        </>
                      ) : crawlDone ? (
                        "Storefront indexed"
                      ) : (
                        "Crawl storefront instead"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {platform === "generic" && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    No WooCommerce or Shopify detected — indexing your public pages for the bot.
                  </p>
                  {crawling && <Progress value={progress} />}
                  {crawlDone && (
                    <p className="text-sm text-emerald-700">Website crawl complete.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {(mode === "no-website" || faqs.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {mode === "no-website" ? "Your FAQs" : "FAQs (optional)"}
              </CardTitle>
              <CardDescription>
                Add questions and answers in English, Sinhala, and/or Tamil — your bot will use these when
                customers ask in any of those languages.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {faqs.length > 0 && (
                <ul className="space-y-2">
                  {faqs.map((faq, index) => (
                    <li
                      key={`${faq.question}-${index}`}
                      className="flex gap-3 rounded-lg border bg-muted/30 p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-medium">{faq.question}</p>
                        <p className="text-muted-foreground whitespace-pre-wrap">{faq.answer}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => void removeFaq(index)}
                        aria-label="Remove FAQ"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-3 border-t pt-4">
                <Input
                  placeholder="Question — e.g. What is your return policy?"
                  value={faqQuestion}
                  onChange={(e) => setFaqQuestion(e.target.value)}
                />
                <Textarea
                  placeholder="Answer"
                  value={faqAnswer}
                  onChange={(e) => setFaqAnswer(e.target.value)}
                  rows={3}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={faqSaving || !faqQuestion.trim() || !faqAnswer.trim()}
                  onClick={addFaq}
                >
                  {faqSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Add FAQ
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={() => next()} disabled={crawling || detecting || !canContinue}>
            Continue
          </Button>
          <Button variant="outline" onClick={() => next(true)} disabled={crawling || detecting}>
            Skip for now
          </Button>
        </div>
        {!canContinue && (
          <p className="text-xs text-muted-foreground">
            {mode === "no-website"
              ? "Add at least one FAQ, or skip and add knowledge later from Settings → Knowledge."
              : "Check your store URL, connect WooCommerce or Shopify, or skip this step."}
          </p>
        )}
      </div>
    </OnboardingShell>
  );
}
