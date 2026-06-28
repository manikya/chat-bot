import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { ChannelInfo, ConversationAnalytics, DashboardStats, Usage } from "@commercechat/mock-api";
import {
  AdminScaffold,
  EmptyState,
  InfoRow,
  MetricCard,
  Section,
} from "../../../src/components/admin/AdminScaffold";
import { useAuth } from "../../../src/lib/auth";
import { api } from "../../../src/lib/api";
import { colors } from "../../../src/theme/colors";

export default function HomeScreen() {
  const router = useRouter();
  const { tenant, user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [analytics, setAnalytics] = useState<ConversationAnalytics | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [dashboardRes, analyticsRes, usageRes, channelsRes] = await Promise.all([
        api.dashboard.getStats(),
        api.analytics.get(),
        api.tenant.getUsage(),
        api.channels.list(),
      ]);
      setStats(dashboardRes.data);
      setAnalytics(analyticsRes.data);
      setUsage(usageRes.data);
      setChannels(channelsRes.data.channels);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminScaffold
      title="Home"
      subtitle={`${tenant?.storeName ?? "CommerceChat"} · ${user?.name ?? "Admin"}`}
      loading={loading}
      error={error}
      actionLabel="Refresh"
      onAction={load}
    >
      {stats ? (
        <Section title="Today">
          <View style={styles.grid}>
            <MetricCard label="Messages today" value={stats.messagesToday} />
            <MetricCard label="This month" value={stats.messagesThisMonth} />
            <MetricCard label="Active chats" value={stats.activeConversations} />
            <MetricCard label="Orders influenced" value={stats.ordersInfluenced} />
          </View>
          <InfoRow label="Quota used" value={`${stats.quotaPercent}%`} />
        </Section>
      ) : (
        <EmptyState message="Dashboard stats are unavailable." />
      )}

      {analytics ? (
        <Section title="Conversation funnel">
          <View style={styles.grid}>
            <MetricCard label="Conversations" value={analytics.summary.conversationsTotal} />
            <MetricCard label="Carts started" value={analytics.summary.cartsStarted} />
            <MetricCard label="Checkout links" value={analytics.summary.checkoutLinks} />
            <MetricCard label="Active" value={analytics.summary.conversationsActive} />
          </View>
        </Section>
      ) : null}

      <Section title="Channel health" actionLabel="Manage" onAction={() => router.push("/(tabs)/settings")}>
        {channels.length ? (
          channels.map((channel) => (
            <InfoRow
              key={channel.channel}
              label={channel.channel}
              value={channel.status}
              tone={channel.status === "connected" ? "good" : "warn"}
            />
          ))
        ) : (
          <EmptyState message="No channels configured yet." />
        )}
      </Section>

      {usage ? (
        <Section title="Usage">
          <InfoRow label="Period" value={usage.period} />
          <InfoRow label="Messages" value={usage.messages} />
          <InfoRow label="Remaining" value={usage.limits.messagesRemaining} />
          <InfoRow label="Estimated LLM cost" value={`$${usage.estimatedLlmCostUsd.toFixed(2)}`} />
        </Section>
      ) : null}

      <Section title="Quick actions">
        <View style={styles.actions}>
          {[
            ["Open chats", "/(tabs)/chats"],
            ["Analytics", "/(tabs)/home/analytics"],
            ["Content ideas", "/(tabs)/home/content-ideas"],
            ["View catalog", "/(tabs)/catalog"],
            ["Sync knowledge", "/(tabs)/knowledge"],
            ["Settings", "/(tabs)/settings"],
          ].map(([label, href]) => (
            <Pressable key={href} style={styles.action} onPress={() => router.push(href)}>
              <Text style={styles.actionText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Section>
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: {
    backgroundColor: colors.softSurface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionText: { color: colors.primary, fontWeight: "800" },
});
