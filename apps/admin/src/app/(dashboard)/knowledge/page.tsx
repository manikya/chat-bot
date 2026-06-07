"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
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

  const load = () => {
    api.knowledge.listSources().then((r) => setSources(r.data.items));
    api.knowledge.listJobs().then((r) => setJobs(r.data.items));
  };

  useEffect(() => { load(); }, []);

  const addWebsite = async () => {
    const res = await api.knowledge.createSource({ type: "website", name: "Main website", config: { url } });
    await api.knowledge.syncSource(res.data.sourceId);
    toast.success("Crawl started");
    setShowAdd(false);
    load();
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
                <Button variant="outline" size="sm" onClick={async () => { await api.knowledge.syncSource(s.sourceId); toast.success("Sync queued"); load(); }}>
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
              <span>{j.type} — {j.sourceId}</span>
              <Badge variant={j.status === "completed" ? "success" : j.status === "running" ? "warning" : "secondary"}>{j.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
