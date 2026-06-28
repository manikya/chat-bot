import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import type { ConversationAnalytics } from "@commercechat/mock-api";
import {
  AdminScaffold,
  EmptyState,
  InfoRow,
  MetricCard,
  Section,
} from "../../../src/components/admin/AdminScaffold";
import { api } from "../../../src/lib/api";

export default function AnalyticsScreen() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<ConversationAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await api.analytics.get();
      setAnalytics(res.data);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminScaffold
      title="Analytics"
      subtitle={analytics ? `${analytics.from} to ${analytics.to}` : undefined}
      loading={loading}
      error={error}
      actionLabel="Back"
      onAction={() => router.back()}
    >
      {analytics ? (
        <>
          <Section title="Summary">
            <View style={styles.grid}>
              <MetricCard label="Messages" value={analytics.summary.messagesTotal} />
              <MetricCard label="Conversations" value={analytics.summary.conversationsTotal} />
              <MetricCard label="Carts" value={analytics.summary.cartsStarted} />
              <MetricCard label="Checkouts" value={analytics.summary.checkoutLinks} />
            </View>
          </Section>

          <Section title="Messages by day">
            {analytics.messagesByDay.map((day) => (
              <InfoRow key={day.date} label={day.date} value={day.messages} />
            ))}
          </Section>

          <Breakdown title="Channels" items={analytics.channelBreakdown} labelKey="channel" />
          <Breakdown title="Intents" items={analytics.intentBreakdown} labelKey="intent" />
          <Breakdown title="Top products" items={analytics.topProducts} labelKey="label" />

          <Section title="Funnel">
            <InfoRow label="Conversations" value={analytics.funnel.conversations} />
            <InfoRow label="With cart" value={analytics.funnel.withCart} />
            <InfoRow label="Checkout links" value={analytics.funnel.checkoutLinks} />
          </Section>
        </>
      ) : (
        <EmptyState message="Analytics are unavailable." />
      )}
    </AdminScaffold>
  );
}

function Breakdown({
  title,
  items,
  labelKey,
}: {
  title: string;
  items: Array<Record<string, string | number>>;
  labelKey: string;
}) {
  return (
    <Section title={title}>
      {items.length ? (
        items.map((item) => (
          <InfoRow key={String(item[labelKey])} label={String(item[labelKey])} value={item.count} />
        ))
      ) : (
        <EmptyState message={`No ${title.toLowerCase()} data yet.`} />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
});
