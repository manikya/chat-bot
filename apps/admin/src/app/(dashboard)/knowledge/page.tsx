"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, MessageSquare, Pause, Play, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import {
  WOOCOMMERCE_PLUGIN_DOWNLOAD_URL,
  WOOCOMMERCE_PLUGIN_INSTALL_STEPS,
} from "@/lib/commerce-plugin";
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

export default function KnowledgePage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState("https://acme-shoes.com");
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [products, setProducts] = useState<Array<{ sku: string; name: string; price: number; currency?: string }>>([]);
  const [wpSiteUrl, setWpSiteUrl] = useState("https://");
  const [wpApiKey, setWpApiKey] = useState("");
  const [wpStatus, setWpStatus] = useState<{
    connected: boolean;
    siteUrl?: string;
    lastSyncAt?: string;
  } | null>(null);
  const [wpConnecting, setWpConnecting] = useState(false);
  const [wpSyncing, setWpSyncing] = useState(false);
  const [pageVoice, setPageVoice] = useState<PageVoiceStatus | null>(null);
  const [pageVoiceSyncing, setPageVoiceSyncing] = useState(false);
  const [pageVoiceUploading, setPageVoiceUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api.knowledge.listSources().then((r) => setSources(r.data.items));
    api.knowledge.listJobs().then((r) => setJobs(r.data.items));
    api.commerce.wordpressStatus().then((r) => setWpStatus(r.data)).catch(() => setWpStatus(null));
    api.knowledge.getPageVoice().then((r) => setPageVoice(r.data)).catch(() => setPageVoice(null));
  };

  useEffect(() => {
    load();
    api.commerce.listProducts({ limit: 20 }).then((r) => setProducts(r.data.items)).catch(() => {});
  }, []);

  const connectWordPress = async () => {
    setWpConnecting(true);
    try {
      await api.commerce.connectWordPress({ siteUrl: wpSiteUrl, apiKey: wpApiKey });
      toast.success("WooCommerce connected");
      setWpApiKey("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setWpConnecting(false);
    }
  };

  const syncWordPress = async () => {
    setWpSyncing(true);
    try {
      const sync = await api.commerce.syncWordPress();
      toast.success("Product sync started");
      await pollIngestJob(sync.data.jobId, () => load());
      toast.success("WooCommerce sync completed");
      load();
      api.commerce.listProducts({ limit: 20 }).then((r) => setProducts(r.data.items)).catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
      load();
    } finally {
      setWpSyncing(false);
    }
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge base</h1>
          <p className="text-muted-foreground">Sources that power your AI answers</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add source</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">WooCommerce store</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Install the <strong>CommerceChat Connector</strong> plugin on WordPress, copy the API key from
            Settings → CommerceChat, then connect below to sync products.
          </p>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
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
          {wpStatus?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="success">Connected</Badge>
                <span className="text-sm">{wpStatus.siteUrl}</span>
              </div>
              {wpStatus.lastSyncAt && (
                <p className="text-xs text-muted-foreground">
                  Last sync {new Date(wpStatus.lastSyncAt).toLocaleString()}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={syncWordPress} disabled={wpSyncing}>
                  {wpSyncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Sync products
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await api.commerce.disconnectWordPress();
                    toast.success("Disconnected");
                    load();
                  }}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Store URL</Label>
                <Input value={wpSiteUrl} onChange={(e) => setWpSiteUrl(e.target.value)} placeholder="https://yourstore.com" />
              </div>
              <div className="space-y-2">
                <Label>API key (from WordPress plugin)</Label>
                <Input
                  type="password"
                  value={wpApiKey}
                  onChange={(e) => setWpApiKey(e.target.value)}
                  placeholder="cc_wp_..."
                />
              </div>
              <Button onClick={connectWordPress} disabled={wpConnecting || !wpSiteUrl.trim() || !wpApiKey.trim()}>
                {wpConnecting ? "Connecting…" : "Connect WooCommerce"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Conversation ingest (Page voice)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Learns your Messenger reply style from owner echoes (paired with the customer message before each
            reply). Upload a JSON or CSV export for older history — no Meta API backfill. Available on Pro and
            above.
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
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Badge variant={pageVoice?.learningPaused ? "secondary" : "success"}>
                {pageVoice?.learningPaused ? "Paused" : "Learning"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {pageVoice?.pairCount ?? 0} samples
                {(pageVoice?.vectorCount ?? 0) > 0 && ` · ${pageVoice?.vectorCount} indexed`}
              </span>
            </div>
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
              <Label htmlFor="page-voice-pause" className="text-sm font-normal">
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
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-medium text-muted-foreground">Preview (PII scrubbed)</p>
              {pageVoice.preview.map((p, i) => (
                <div key={i} className="text-sm space-y-1 border-b pb-2 last:border-0 last:pb-0">
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
              {pageVoiceUploading ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
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
              {pageVoiceSyncing ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
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

      {showAdd && (
        <Card>
          <CardHeader><CardTitle className="text-base">Add website</CardTitle></CardHeader>
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

      <Card>
        <CardHeader><CardTitle className="text-base">Quick FAQ</CardTitle></CardHeader>
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

      {products.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Catalog products</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {products.map((p) => (
              <div key={p.sku} className="flex justify-between text-sm border-b py-2 last:border-0">
                <span>{p.name}</span>
                <span className="text-muted-foreground">
                  {p.sku} · {formatProductPrice(p.price, p.currency)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {sources.map((s) => (
          <Card key={s.sourceId}>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{s.name}</h3>
                  <Badge variant="secondary">{s.type}</Badge>
                  <Badge variant="success">{s.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
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
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent ingest jobs</CardTitle></CardHeader>
        <CardContent className="space-y-0">
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ingest jobs yet.</p>
          ) : (
            jobs.map((j) => {
              const statLines = formatIngestJobStats(j);
              const inProgress = j.status === "running" || j.status === "queued";
              return (
                <div key={j.jobId} className="flex items-start justify-between gap-4 border-b py-3 text-sm last:border-0">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{ingestJobTypeLabel(j.type)}</p>
                    <p className="truncate text-muted-foreground">{j.sourceId}</p>
                    {statLines.length > 0 && (
                      <p className="text-muted-foreground">{statLines.join(" · ")}</p>
                    )}
                    {inProgress && j.progressPct != null && j.progressPct > 0 && (
                      <p className="text-muted-foreground">{j.progressPct}% complete</p>
                    )}
                    {j.status === "failed" && j.error && (
                      <p className="text-xs text-destructive">{j.error}</p>
                    )}
                    {j.completedAt && (
                      <p className="text-xs text-muted-foreground">
                        Finished {new Date(j.completedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={
                      j.status === "completed"
                        ? "success"
                        : inProgress
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {j.status}
                  </Badge>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
