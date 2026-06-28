import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { DailySocialContent, SocialContentIdea } from "@commercechat/mock-api";
import {
  AdminScaffold,
  EmptyState,
  InfoRow,
  PrimaryButton,
  Section,
} from "../../../src/components/admin/AdminScaffold";
import { api } from "../../../src/lib/api";
import { colors } from "../../../src/theme/colors";

export default function ContentIdeasScreen() {
  const router = useRouter();
  const [content, setContent] = useState<DailySocialContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await api.socialContent.getDaily();
      setContent(res.data ?? null);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Failed to load content ideas");
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.socialContent.generateDaily();
      setContent(res.data);
      Alert.alert("Ideas ready", "Today's content ideas were generated.");
    } catch (e) {
      setError((e as { message?: string }).message ?? "Failed to generate ideas");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminScaffold
      title="Content Ideas"
      subtitle={content ? `${content.date} · ${content.source}` : "Daily social prompts"}
      loading={loading}
      error={error}
      actionLabel="Back"
      onAction={() => router.back()}
    >
      {content ? (
        <>
          <Section title="Today">
            <Text style={styles.summary}>{content.summary}</Text>
            <InfoRow label="Store" value={content.storeName} />
            <InfoRow label="Generated" value={new Date(content.generatedAt).toLocaleTimeString()} />
          </Section>

          <Section title="Ideas">
            {content.ideas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </Section>

          <Section title="Signals used">
            <ChipLine label="Products" items={content.signals.products} />
            <ChipLine label="Categories" items={content.signals.categories} />
            <ChipLine label="Tags" items={content.signals.tags} />
          </Section>
        </>
      ) : (
        <Section title="No ideas yet">
          <EmptyState message="Generate ideas now or wait for tomorrow morning's push." />
        </Section>
      )}

      <PrimaryButton
        label={busy ? "Generating..." : "Generate today's ideas"}
        onPress={generate}
        disabled={busy}
      />
    </AdminScaffold>
  );
}

function IdeaCard({ idea }: { idea: SocialContentIdea }) {
  return (
    <View style={styles.idea}>
      <View style={styles.ideaHeader}>
        <Text style={styles.ideaTitle}>{idea.title}</Text>
        <Text style={styles.format}>{idea.suggestedFormat}</Text>
      </View>
      <Text style={styles.angle}>{idea.productAngle}</Text>
      <Text style={styles.caption}>{idea.captionIdea}</Text>
      <Text style={styles.why}>{idea.whyToday}</Text>
      {idea.hashtags.length ? (
        <View style={styles.tags}>
          {idea.hashtags.slice(0, 6).map((tag) => (
            <Text key={tag} style={styles.tag}>
              {tag}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ChipLine({ label, items }: { label: string; items: string[] }) {
  return (
    <View style={styles.signalRow}>
      <Text style={styles.signalLabel}>{label}</Text>
      <Text style={styles.signalValue} numberOfLines={2}>
        {items.slice(0, 8).join(", ") || "None"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { color: colors.text, fontWeight: "800", lineHeight: 19 },
  idea: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
    gap: 6,
  },
  ideaHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  ideaTitle: { color: colors.text, flex: 1, fontSize: 14, fontWeight: "800" },
  format: {
    color: colors.primary,
    backgroundColor: colors.softSurface,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
  },
  angle: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  caption: { color: colors.text, fontSize: 13, lineHeight: 18 },
  why: { color: colors.textMuted, fontSize: 12, lineHeight: 16 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  signalRow: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    gap: 3,
  },
  signalLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  signalValue: { color: colors.text, fontSize: 12, lineHeight: 16 },
});
