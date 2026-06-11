"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { pollIngestJob } from "@/lib/poll-job";
import type { IngestJob, KnowledgeSource } from "@commercechat/mock-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function KnowledgePage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState("https://acme-shoes.com");
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [products, setProducts] = useState<Array<{ sku: string; name: string; price: number }>>([]);
  const [wpSiteUrl, setWpSiteUrl] = useState("https://");
  const [wpApiKey, setWpApiKey] = useState("");
  const [wpStatus, setWpStatus] = useState<{
    connected: boolean;
    siteUrl?: string;
    lastSyncAt?: string;
  } | null>(null);
  const [wpConnecting, setWpConnecting] = useState(false);
  const [wpSyncing, setWpSyncing] = useState(false);

  const load = () => {
    api.knowledge.listSources().then((r) => setSources(r.data.items));
    api.knowledge.listJobs().then((r) => setJobs(r.data.items));
    api.commerce.wordpressStatus().then((r) => setWpStatus(r.data)).catch(() => setWpStatus(null));
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
            Install the <strong>CommerceChat Connector</strong> plugin on WordPress (Settings → CommerceChat),
            copy the API key, then connect below to sync products into your knowledge base.
          </p>
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
                await api.knowledge.ingestFaq([{ question: faqQuestion, answer: faqAnswer }]);
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
                <span className="text-muted-foreground">{p.sku} · ${p.price}</span>
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
        <CardContent className="space-y-2">
          {jobs.map((j) => (
            <div key={j.jobId} className="flex justify-between text-sm border-b py-2 last:border-0">
              <span>
                {j.type} — {j.sourceId}
                {j.stats?.chunksCreated != null && ` · ${j.stats.chunksCreated} chunks`}
              </span>
              <Badge variant={j.status === "completed" ? "success" : j.status === "running" || j.status === "queued" ? "warning" : "secondary"}>
                {j.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
