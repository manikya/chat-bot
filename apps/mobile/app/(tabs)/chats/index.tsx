import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { ChannelType, Conversation } from "@commercechat/mock-api";
import { ConversationRow } from "../../../src/components/ConversationRow";
import {
  AdminScaffold,
  EmptyState,
  TextField,
} from "../../../src/components/admin/AdminScaffold";
import { useAuth } from "../../../src/lib/auth";
import { api } from "../../../src/lib/api";
import { colors } from "../../../src/theme/colors";

const CHANNELS: Array<"all" | ChannelType> = ["all", "whatsapp", "messenger", "instagram", "web"];

export default function ChatsScreen() {
  const router = useRouter();
  const { tenant } = useAuth();
  const [items, setItems] = useState<Conversation[]>([]);
  const [mode, setMode] = useState<"human" | "bot" | "all">("human");
  const [channel, setChannel] = useState<"all" | ChannelType>("all");
  const [status, setStatus] = useState<"all" | "active">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await api.conversations.list({
        channel: channel === "all" ? undefined : channel,
        handlingMode: mode === "all" ? undefined : mode,
        status: status === "all" ? undefined : status,
        limit: 100,
      });
      setItems(res.data.items);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void load();
  }, [mode, channel, status]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = [
        item.customerName,
        item.externalUserId,
        item.channel,
        item.lastIntent,
        item.lastSubIntent,
        item.cart?.firstItemName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query]);

  const needsAgent = items.filter((item) => item.handlingMode === "human").length;

  return (
    <AdminScaffold
      title="Chats"
      subtitle={`${tenant?.storeName ?? "Store"} · ${needsAgent} need agent`}
      loading={loading}
      error={error}
      actionLabel="Refresh"
      onAction={load}
    >
      <View style={styles.filters}>
        {[
          ["Needs agent", "human"],
          ["Bot", "bot"],
          ["All", "all"],
        ].map(([label, value]) => (
          <Pressable
            key={value}
            style={[styles.chip, mode === value && styles.chipActive]}
            onPress={() => setMode(value as typeof mode)}
          >
            <Text style={[styles.chipText, mode === value && styles.chipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.filters}>
        {CHANNELS.map((value) => (
          <Pressable
            key={value}
            style={[styles.chip, channel === value && styles.chipActive]}
            onPress={() => setChannel(value)}
          >
            <Text style={[styles.chipText, channel === value && styles.chipTextActive]}>
              {value === "all" ? "All channels" : value}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.filters}>
        {[
          ["Any status", "all"],
          ["Active", "active"],
        ].map(([label, value]) => (
          <Pressable
            key={value}
            style={[styles.chip, status === value && styles.chipActive]}
            onPress={() => setStatus(value as typeof status)}
          >
            <Text style={[styles.chipText, status === value && styles.chipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <TextField
        label="Search conversations"
        value={query}
        onChangeText={setQuery}
        placeholder="Customer, channel, intent, product"
      />

      <View style={styles.list}>
        {filtered.length ? (
          filtered.map((item) => (
            <ConversationRow
              key={item.conversationId}
              item={item}
              onPress={() => router.push(`/thread/${item.conversationId}`)}
            />
          ))
        ) : (
          <EmptyState message="No conversations match these filters." />
        )}
      </View>
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderRadius: 15,
    backgroundColor: colors.softSurface,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.textMuted, fontWeight: "800", fontSize: 11 },
  chipTextActive: { color: "#fff" },
  list: {
    backgroundColor: colors.listBg,
    borderRadius: 12,
    overflow: "hidden",
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
