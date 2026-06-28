import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import type { IngestJob, KnowledgeSource } from "@commercechat/mock-api";
import {
  AdminScaffold,
  EmptyState,
  InfoRow,
  PrimaryButton,
  Section,
  TextField,
} from "../../../src/components/admin/AdminScaffold";
import { api } from "../../../src/lib/api";
import { colors } from "../../../src/theme/colors";

type PageVoice = {
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

export default function KnowledgeScreen() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [faq, setFaq] = useState<Array<{ question: string; answer: string }>>([]);
  const [pageVoice, setPageVoice] = useState<PageVoice | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [sourcesRes, jobsRes, faqRes, voiceRes] = await Promise.all([
        api.knowledge.listSources(),
        api.knowledge.listJobs(),
        api.knowledge.listFaq(),
        api.knowledge.getPageVoice(),
      ]);
      setSources(sourcesRes.data.items);
      setJobs(jobsRes.data.items);
      setFaq(faqRes.data.items);
      setPageVoice(voiceRes.data);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Failed to load knowledge");
    } finally {
      setLoading(false);
      setBusy(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addWebsiteSource() {
    if (!sourceName.trim() || !sourceUrl.trim()) return;
    setBusy("source");
    try {
      await api.knowledge.createSource({
        type: "website",
        name: sourceName.trim(),
        config: { url: sourceUrl.trim() },
      });
      setSourceName("");
      setSourceUrl("");
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not add source");
      setBusy(null);
    }
  }

  async function addFaq() {
    if (!faqQuestion.trim() || !faqAnswer.trim()) return;
    setBusy("faq");
    try {
      await api.knowledge.ingestFaq(
        [{ question: faqQuestion.trim(), answer: faqAnswer.trim() }],
        true
      );
      setFaqQuestion("");
      setFaqAnswer("");
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not save FAQ");
      setBusy(null);
    }
  }

  async function syncSource(sourceId: string) {
    setBusy(sourceId);
    try {
      await api.knowledge.syncSource(sourceId);
      Alert.alert("Sync started", "Knowledge sync has been queued.");
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Sync failed");
      setBusy(null);
    }
  }

  function cancelJob(job: IngestJob) {
    Alert.alert("Cancel sync job?", `Cancel ${job.type}?`, [
      { text: "Keep running", style: "cancel" },
      {
        text: "Cancel job",
        style: "destructive",
        onPress: async () => {
          setBusy(job.jobId);
          try {
            await api.knowledge.cancelJob(job.jobId);
            await load();
          } catch (e) {
            setError((e as { message?: string }).message ?? "Cancel failed");
            setBusy(null);
          }
        },
      },
    ]);
  }

  function cancelRunningJobs() {
    const running = jobs.filter((job) => job.status === "running" || job.status === "queued");
    if (!running.length) return;
    Alert.alert("Cancel running jobs?", `Cancel ${running.length} queued/running sync job(s)?`, [
      { text: "Keep running", style: "cancel" },
      {
        text: "Cancel jobs",
        style: "destructive",
        onPress: async () => {
          setBusy("cancel-running");
          try {
            await Promise.all(running.map((job) => api.knowledge.cancelJob(job.jobId)));
            await load();
          } catch (e) {
            setError((e as { message?: string }).message ?? "Cancel failed");
            setBusy(null);
          }
        },
      },
    ]);
  }

  async function deleteSource(source: KnowledgeSource) {
    Alert.alert("Delete source?", `Remove ${source.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(source.sourceId);
          try {
            await api.knowledge.deleteSource(source.sourceId);
            await load();
          } catch (e) {
            setError((e as { message?: string }).message ?? "Delete failed");
            setBusy(null);
          }
        },
      },
    ]);
  }

  async function togglePageVoice() {
    if (!pageVoice) return;
    setBusy("pageVoice");
    try {
      await api.knowledge.updatePageVoice({ learningPaused: !pageVoice.learningPaused });
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not update page voice");
      setBusy(null);
    }
  }

  return (
    <AdminScaffold
      title="Knowledge"
      subtitle={`${sources.length} sources · ${jobs.length} jobs`}
      loading={loading}
      error={error}
      actionLabel="Refresh"
      onAction={load}
    >
      <Section title="Sources">
        {sources.length ? (
          sources.map((source) => (
            <View key={source.sourceId} style={styles.source}>
              <View style={styles.sourceHeader}>
                <View style={styles.sourceText}>
                  <Text style={styles.sourceName}>{source.name}</Text>
                  <Text style={styles.sourceMeta}>
                    {source.type} · {source.status} · {source.vectorCount} vectors
                  </Text>
                </View>
                <View style={styles.sourceActions}>
                  <Pressable onPress={() => syncSource(source.sourceId)} disabled={busy === source.sourceId}>
                    <Text style={styles.link}>Sync</Text>
                  </Pressable>
                  <Pressable onPress={() => deleteSource(source)} disabled={busy === source.sourceId}>
                    <Text style={styles.dangerLink}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        ) : (
          <EmptyState message="Add a website, FAQ, or catalog source to train the bot." />
        )}
      </Section>

      <Section title="Add website source">
        <TextField label="Name" value={sourceName} onChangeText={setSourceName} placeholder="Main site" />
        <TextField
          label="Website URL"
          value={sourceUrl}
          onChangeText={setSourceUrl}
          placeholder="https://example.com"
          keyboardType="url"
        />
        <PrimaryButton
          label="Add source"
          onPress={addWebsiteSource}
          disabled={busy === "source" || !sourceName.trim() || !sourceUrl.trim()}
        />
      </Section>

      <Section title="FAQ manager">
        <InfoRow label="Stored FAQs" value={faq.length} />
        <TextField
          label="Question"
          value={faqQuestion}
          onChangeText={setFaqQuestion}
          placeholder="What is your return policy?"
        />
        <TextField
          label="Answer"
          value={faqAnswer}
          onChangeText={setFaqAnswer}
          placeholder="We accept returns within 30 days..."
          multiline
        />
        <PrimaryButton
          label="Add FAQ"
          onPress={addFaq}
          disabled={busy === "faq" || !faqQuestion.trim() || !faqAnswer.trim()}
        />
      </Section>

      <Section title="Page voice">
        {pageVoice ? (
          <>
            <InfoRow label="Learning" value={pageVoice.learningPaused ? "Paused" : "Active"} />
            <InfoRow label="Pairs" value={pageVoice.pairCount} />
            <InfoRow label="Vectors" value={pageVoice.vectorCount} />
            <InfoRow label="Last sync" value={pageVoice.lastSyncAt} />
            <PrimaryButton
              label={pageVoice.learningPaused ? "Resume learning" : "Pause learning"}
              onPress={togglePageVoice}
              disabled={busy === "pageVoice"}
            />
            <PrimaryButton
              label="Sync page voice"
              onPress={() => {
                setBusy("pageVoiceSync");
                void api.knowledge.syncPageVoice().then(load).catch((e) => {
                  setError((e as { message?: string }).message ?? "Page voice sync failed");
                  setBusy(null);
                });
              }}
              disabled={busy === "pageVoiceSync"}
            />
          </>
        ) : (
          <EmptyState message="Page voice is not configured." />
        )}
      </Section>

      <Section
        title="Recent jobs"
        actionLabel={jobs.some((job) => job.status === "running" || job.status === "queued") ? "Cancel running" : undefined}
        onAction={cancelRunningJobs}
      >
        {jobs.length ? (
          jobs.slice(0, 8).map((job) => {
            const cancellable = job.status === "running" || job.status === "queued";
            return (
              <View key={job.jobId} style={styles.jobRow}>
                <View style={styles.jobInfo}>
                  <InfoRow
                    label={job.type}
                    value={job.progressPct ? `${job.status} · ${job.progressPct}%` : job.status}
                    tone={
                      job.status === "completed"
                        ? "good"
                        : job.status === "failed" || job.status === "cancelled"
                          ? "danger"
                          : "warn"
                    }
                  />
                </View>
                {cancellable ? (
                  <Pressable onPress={() => cancelJob(job)} disabled={busy === job.jobId}>
                    <Text style={styles.dangerLink}>Cancel</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })
        ) : (
          <EmptyState message="No ingest jobs yet." />
        )}
      </Section>
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  source: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  sourceHeader: { flexDirection: "row", gap: 8, alignItems: "center" },
  sourceText: { flex: 1 },
  sourceName: { color: colors.text, fontWeight: "800", fontSize: 13 },
  sourceMeta: { color: colors.textMuted, marginTop: 2, fontSize: 11 },
  sourceActions: { flexDirection: "row", gap: 10 },
  link: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  dangerLink: { color: colors.danger, fontWeight: "800", fontSize: 12 },
  jobRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  jobInfo: { flex: 1 },
});
