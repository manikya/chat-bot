"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Download, Globe, MessageSquare, Pause, Play, Plus, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import { ShopifyConnectCard } from "@/components/onboarding/shopify-connect-card";
import { WooCommerceConnectCard } from "@/components/onboarding/woocommerce-connect-card";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { pollIngestJob } from "@/lib/poll-job";
import { formatIngestJobStats, ingestJobTypeLabel } from "@/lib/format-ingest-job";
import type { IngestJob, KnowledgeSource } from "@commercechat/mock-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

function formatProductPrice(price: number, currency = "USD") {
  const locale = currency === "LKR" ? "en-LK" : "en";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}

type PageVoiceStatus = {
  conversationIngestEnabled?: boolean;
  sourceId: string | null;
  learningPaused: boolean;
  pairCount: number;
  vectorCount: number;
  lastCaptureAt: string | null;
  lastSyncAt: string | null;
  platform: string;
  preview: Array<{ customerText: string; ownerText: string; capturedAt: string }>;
};

function IconFrame({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`grid h-8 w-8 place-items-center rounded-lg border ${className}`}>
      {children}
    </span>
  );
}

function BrandGlyph({ name }: { name: "woocommerce" | "shopify" }) {
  if (name === "woocommerce") {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="h-7 w-7">
        <rect x="5" y="11" width="38" height="25" rx="8" fill="currentColor" opacity="0.16" />
        <path d="M12 18h19a6 6 0 0 1 0 12H20l-6 5v-5h-2a6 6 0 0 1 0-12z" fill="currentColor" />
        <text x="17" y="27" fill="white" fontSize="8" fontWeight="800" fontFamily="Arial, sans-serif">Woo</text>
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="h-7 w-7">
      <path d="M17 13.5l13.7-1.1 5 29.4-24.5-2.4L17 13.5z" fill="currentColor" opacity="0.9" />
      <path d="M20.4 13.2c.9-4 2.8-6.5 5.3-6.2 2.1.3 3.2 2.7 3.5 5.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M27.2 20.5c-1.1-.7-2.2-1-3.3-.9-2.4.2-3.3 2.8-1.2 4.1l2.7 1.5c2.5 1.5 1.4 5.2-2 5.3-1.5 0-3-.5-4.4-1.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function SourceCard({
  title,
  icon,
  badge,
  badgeVariant = "secondary",
  description,
  meter,
  action,
}: {
  title: string;
  icon: ReactNode;
  badge: string;
  badgeVariant?: "success" | "warning" | "secondary";
  description: string;
  meter?: number;
  action: ReactNode;
}) {
  return (
    <Card className="min-h-[178px]">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center gap-3">
          {icon}
          {title}
        </CardTitle>
        <Badge variant={badgeVariant}>{badge}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="min-h-[42px] text-sm leading-relaxed text-muted-foreground">{description}</p>
        {meter != null && <Meter value={meter} />}
        {action}
      </CardContent>
    </Card>
  );
}

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.075em] text-primary">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function KnowledgePage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState("https://acme-shoes.com");
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [products, setProducts] = useState<Array<{ sku: string; name: string; price: number; currency?: string }>>([]);
  const [pageVoice, setPageVoice] = useState<PageVoiceStatus | null>(null);
  const [pageVoiceSyncing, setPageVoiceSyncing] = useState(false);
  const [pageVoiceUploading, setPageVoiceUploading] = useState(false);
  const [expandedConnector, setExpandedConnector] = useState<"woocommerce" | "shopify" | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api.knowledge.listSources().then((r) => setSources(r.data.items));
    api.knowledge.listJobs().then((r) => setJobs(r.data.items));
    api.knowledge.getPageVoice().then((r) => setPageVoice(r.data)).catch(() => setPageVoice(null));
  };

  useEffect(() => {
    load();
    api.commerce.listProducts({ limit: 20 }).then((r) => setProducts(r.data.items)).catch(() => {});
  }, []);

  const refreshProducts = () => {
    api.commerce.listProducts({ limit: 20 }).then((r) => setProducts(r.data.items)).catch(() => {});
  };

  const addWebsite = async () => {
    try {
      const res = await api.knowledge.createSource({
        type: "website",
        name: "Main website",
        config: { url, maxDepth: 2, maxPages: 30 },
      });
      const sync = await api.knowledge.syncSource(res.data.sourceId);
      toast.success("Crawl started");
      setShowAdd(false);
      await pollIngestJob(sync.data.jobId, () => load());
      toast.success("Crawl completed");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Crawl failed");
      load();
    }
  };

  const websiteSources = sources.filter((source) => source.type === "website");
  const wooSources = sources.filter((source) => source.type === "woocommerce");
  const shopifySources = sources.filter((source) => source.type === "shopify");
  const catalogSources = sources.filter((source) => source.type === "catalog" || source.type === "woocommerce" || source.type === "shopify");
  const faqSources = sources.filter((source) => source.type === "faq");
  const websiteChunks = websiteSources.reduce((sum, source) => sum + source.chunkCount, 0);
  const websiteVectors = websiteSources.reduce((sum, source) => sum + source.vectorCount, 0);
  const completedJobs = jobs.filter((job) => job.status === "completed").length;
  const runningJobs = jobs.filter((job) => job.status === "running" || job.status === "queued").length;
  const productCoverage = products.length ? 91 : 0;
  const websiteCoverage = websiteSources.length ? 78 : 0;
  const pageVoiceCoverage = pageVoice?.vectorCount ? Math.min(100, Math.max(12, pageVoice.vectorCount)) : 0;
  const wooStatus = wooSources.length ? "connected" : products.length ? "products loaded" : "not connected";
  const shopifyStatus = shopifySources.length ? "connected" : "not connected";
  const websiteStatus = websiteSources.length ? "indexed" : "not indexed";
  const pageVoiceStatus =
    pageVoice?.conversationIngestEnabled === false
      ? "not enabled"
      : pageVoice?.learningPaused
        ? "paused"
        : "learning";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.075em] text-primary">
            Knowledge operations
          </p>
          <h1 className="max-w-[760px] font-bold">Stage every source before the agent speaks.</h1>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            Stores, website crawl, quick FAQ, page voice, products, and ingest jobs stay visible in one workflow.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" />
          Add source
        </Button>
      </div>

      <Section
        eyebrow="Commerce catalog"
        title="Product and store sources"
        description="These sources power product recommendations, stock-aware answers, and commerce actions."
      >
      <div className="grid gap-4 md:grid-cols-2">
        <SourceCard
          title="WooCommerce store"
          icon={
            <IconFrame className="border-purple-200 bg-purple-100 text-purple-700">
              <BrandGlyph name="woocommerce" />
            </IconFrame>
          }
          badge={wooStatus}
          badgeVariant={wooSources.length || products.length ? "success" : "secondary"}
          description={`${products.length || "No"} products loaded for recommendations and order-aware answers.`}
          meter={productCoverage}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpandedConnector(expandedConnector === "woocommerce" ? null : "woocommerce")}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Manage WooCommerce
            </Button>
          }
        />

        <SourceCard
          title="Shopify store"
          icon={
            <IconFrame className="border-emerald-200 bg-emerald-100 text-emerald-700">
              <BrandGlyph name="shopify" />
            </IconFrame>
          }
          badge={shopifyStatus}
          badgeVariant={shopifySources.length ? "success" : "secondary"}
          description="Connect Shopify when this store should feed product, stock, and order context."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpandedConnector(expandedConnector === "shopify" ? null : "shopify")}
            >
              <BrandGlyph name="shopify" />
              Manage Shopify
            </Button>
          }
        />
      </div>
      </Section>

      {(expandedConnector === "woocommerce" || expandedConnector === "shopify") && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>{expandedConnector === "woocommerce" ? "WooCommerce connection" : "Shopify connection"}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setExpandedConnector(null)}>
              Close
            </Button>
          </CardHeader>
          <CardContent>
            {expandedConnector === "woocommerce" ? (
              <WooCommerceConnectCard
                manageActions
                onStatusChange={() => {
                  load();
                  refreshProducts();
                }}
              />
            ) : (
              <ShopifyConnectCard
                manageActions
                onStatusChange={() => {
                  load();
                  refreshProducts();
                }}
              />
            )}
          </CardContent>
        </Card>
      )}

      <Section
        eyebrow="Website knowledge"
        title="Storefront and policy content"
        description="Use this for pages such as delivery, returns, collections, sizing, store story, and FAQs already published on the website."
      >
      <div className="grid gap-4 md:grid-cols-2">

        <SourceCard
          title="Main website crawl"
          icon={
            <IconFrame className="border-slate-200 bg-slate-100 text-slate-700">
              <Globe className="h-4 w-4" />
            </IconFrame>
          }
          badge={websiteStatus}
          badgeVariant={websiteSources.length ? "success" : "secondary"}
          description={`${websiteSources.length || "No"} website sources, ${websiteChunks} chunks, ${websiteVectors} vectors indexed.`}
          meter={websiteCoverage}
          action={
            <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add website
            </Button>
          }
        />
      </div>
      </Section>

      {showAdd && (
        <Card>
          <CardHeader><CardTitle>Add website</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Website URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={addWebsite}>Crawl site</Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Section
        eyebrow="Conversation learning"
        title="Owner voice and reply examples"
        description="Use this for learning how the store owner responds, separate from static website or catalog knowledge."
      >
      <div className="grid gap-4 md:grid-cols-2">
        <SourceCard
          title="Page voice"
          icon={
            <IconFrame className="border-teal-200 bg-teal-100 text-primary">
              <Sparkles className="h-4 w-4" />
            </IconFrame>
          }
          badge={pageVoiceStatus}
          badgeVariant={pageVoiceStatus === "learning" ? "success" : pageVoiceStatus === "not enabled" ? "warning" : "secondary"}
          description={`${pageVoice?.pairCount ?? 0} owner reply pairs, ${pageVoice?.vectorCount ?? 0} vectors, PII scrubbed before training.`}
          meter={pageVoiceCoverage}
          action={
            <Button variant="outline" size="sm" onClick={() => uploadInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              Upload history
            </Button>
          }
        />
      </div>
      </Section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-3">
            <IconFrame className="border-teal-200 bg-teal-100 text-primary">
              <MessageSquare className="h-4 w-4" />
            </IconFrame>
            Page voice operations
          </CardTitle>
          <Badge variant={pageVoice?.learningPaused ? "secondary" : "success"}>
            {pageVoice?.learningPaused ? "paused" : "active"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Manage owner-reply learning, import historic examples, and re-index page voice without leaving the source workflow.
          </p>

          {pageVoice && pageVoice.conversationIngestEnabled === false && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Upgrade to Pro to enable conversation ingest and page voice learning.{" "}
              <Link href="/billing" className="font-medium underline">
                View plans
              </Link>
            </div>
          )}

          {pageVoice?.conversationIngestEnabled !== false && (
            <>
              <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted px-3 py-2.5">
                <span className="text-sm text-muted-foreground">
                  {pageVoice?.pairCount ?? 0} samples
                  {(pageVoice?.vectorCount ?? 0) > 0 && ` · ${pageVoice?.vectorCount} indexed`}
                </span>
                <div className="flex items-center gap-2">
                  <Switch
                    id="page-voice-pause"
                    checked={!pageVoice?.learningPaused}
                    onCheckedChange={async (on) => {
                      try {
                        await api.knowledge.updatePageVoice({ learningPaused: !on });
                        toast.success(on ? "Learning resumed" : "Learning paused");
                        load();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Update failed");
                      }
                    }}
                  />
                  <Label htmlFor="page-voice-pause" className="normal-case tracking-normal">
                    {pageVoice?.learningPaused ? (
                      <span className="inline-flex items-center gap-1"><Pause className="h-3 w-3" /> Paused</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><Play className="h-3 w-3" /> Active</span>
                    )}
                  </Label>
                </div>
              </div>

              {pageVoice?.lastSyncAt && (
                <p className="text-xs text-muted-foreground">
                  Last indexed {new Date(pageVoice.lastSyncAt).toLocaleString()}
                  {pageVoice.lastCaptureAt && ` · Last capture ${new Date(pageVoice.lastCaptureAt).toLocaleString()}`}
                </p>
              )}

              {pageVoice?.preview && pageVoice.preview.length > 0 && (
                <div className="space-y-2 rounded-lg border border-border bg-muted p-3">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.075em] text-muted-foreground">
                    Preview, PII scrubbed
                  </p>
                  {pageVoice.preview.map((p, i) => (
                    <div key={i} className="space-y-1 border-b border-border pb-2 text-sm last:border-0 last:pb-0">
                      <p><span className="text-muted-foreground">Customer:</span> {p.customerText}</p>
                      <p><span className="text-muted-foreground">Owner:</span> {p.ownerText}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".json,.csv"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setPageVoiceUploading(true);
                    try {
                      const res = await api.knowledge.uploadPageVoice(file);
                      toast.success(`Imported ${res.data.added} conversation pairs`);
                      if (res.data.jobId) {
                        await pollIngestJob(res.data.jobId, () => load());
                      }
                      load();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Upload failed");
                    } finally {
                      setPageVoiceUploading(false);
                      if (uploadInputRef.current) uploadInputRef.current.value = "";
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pageVoiceUploading}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  {pageVoiceUploading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  Upload history
                </Button>
                <Button
                  size="sm"
                  disabled={pageVoiceSyncing || !(pageVoice?.pairCount ?? 0)}
                  onClick={async () => {
                    setPageVoiceSyncing(true);
                    try {
                      const sync = await api.knowledge.syncPageVoice();
                      toast.success("Re-sync started");
                      await pollIngestJob(sync.data.jobId, () => load());
                      toast.success("Page voice indexed");
                      load();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Sync failed");
                      load();
                    } finally {
                      setPageVoiceSyncing(false);
                    }
                  }}
                >
                  {pageVoiceSyncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Re-sync
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!(pageVoice?.pairCount ?? 0)}
                  onClick={async () => {
                    try {
                      const res = await api.knowledge.exportPageVoice();
                      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "page-voice-export.json";
                      a.click();
                      URL.revokeObjectURL(url);
                      toast.success(`Exported ${res.data.pairCount} pairs`);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Export failed");
                    }
                  }}
                >
                  <Download className="h-3 w-3" />
                  Export JSON
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Section
        eyebrow="Static knowledge"
        title="Manual answers"
        description="Use this for stable answers that should not depend on product inventory or crawled pages."
      >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Quick FAQ</CardTitle>
            <Badge variant={faqSources.length ? "success" : "secondary"}>
              {faqSources.length ? "saved" : "not added"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Question</Label>
              <Input value={faqQuestion} onChange={(e) => setFaqQuestion(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Answer</Label>
              <Input value={faqAnswer} onChange={(e) => setFaqAnswer(e.target.value)} />
            </div>
            <Button
              onClick={async () => {
                try {
                  await api.knowledge.ingestFaq([{ question: faqQuestion, answer: faqAnswer }], true);
                  toast.success("FAQ saved");
                  setFaqQuestion("");
                  setFaqAnswer("");
                  load();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "FAQ save failed");
                }
              }}
              disabled={!faqQuestion.trim() || !faqAnswer.trim()}
            >
              Add FAQ
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Recent ingest jobs</CardTitle>
            <Badge variant={runningJobs ? "warning" : completedJobs ? "success" : "secondary"}>
              {runningJobs ? `${runningJobs} running` : completedJobs ? `${completedJobs} completed` : "none"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No ingest jobs yet.</p>
            ) : (
              jobs.slice(0, 5).map((j) => {
                const statLines = formatIngestJobStats(j);
                const inProgress = j.status === "running" || j.status === "queued";
                return (
                  <div key={j.jobId} className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted px-3 py-2.5 text-sm">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">{ingestJobTypeLabel(j.type)}</p>
                      <p className="truncate text-muted-foreground">{j.sourceId}</p>
                      {statLines.length > 0 && <p className="text-muted-foreground">{statLines.join(" · ")}</p>}
                      {inProgress && j.progressPct != null && j.progressPct > 0 && (
                        <p className="text-muted-foreground">{j.progressPct}% complete</p>
                      )}
                      {j.status === "failed" && j.error && <p className="text-xs text-destructive">{j.error}</p>}
                    </div>
                    <Badge variant={j.status === "completed" ? "success" : inProgress ? "warning" : "secondary"}>
                      {j.status}
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
      </Section>

      {products.length > 0 && (
        <Section
          eyebrow="Catalog preview"
          title="Loaded products"
          description="A small sample of product records currently available for product cards and recommendations."
        >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Catalog products</CardTitle>
            <Badge variant="success">{products.length} loaded</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {products.map((p) => (
              <div key={p.sku} className="flex justify-between gap-4 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                <span className="font-medium">{p.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {p.sku} · {formatProductPrice(p.price, p.currency)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
        </Section>
      )}

      <Section
        eyebrow="Source operations"
        title="Indexed source records"
        description="Low-level source records that can be re-synced or removed."
      >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Indexed sources</CardTitle>
          <Badge variant={sources.length ? "success" : "secondary"}>{sources.length} sources</Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sources connected yet.</p>
          ) : (
            sources.map((s) => (
              <div key={s.sourceId} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted px-3 py-2.5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{s.name}</h3>
                    <Badge variant="secondary">{s.type}</Badge>
                    <Badge variant="success">{s.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {s.chunkCount} chunks · {s.vectorCount} vectors
                    {s.lastSyncAt && ` · Last sync ${new Date(s.lastSyncAt).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const sync = await api.knowledge.syncSource(s.sourceId);
                        toast.success("Sync queued");
                        await pollIngestJob(sync.data.jobId, () => load());
                        toast.success("Sync completed");
                        load();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Sync failed");
                        load();
                      }
                    }}
                  >
                    <RefreshCw className="h-3 w-3" /> Re-sync
                  </Button>
                  <Button variant="outline" size="sm" onClick={async () => { await api.knowledge.deleteSource(s.sourceId); toast.success("Deleted"); load(); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      </Section>
    </div>
  );
}
