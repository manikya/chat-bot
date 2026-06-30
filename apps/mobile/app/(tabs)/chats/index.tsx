import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import type { ChannelType, Conversation } from "@commercechat/mock-api";
import { ConversationRow } from "../../../src/components/ConversationRow";
import {
  AdminScaffold,
  EmptyState,
} from "../../../src/components/admin/AdminScaffold";
import { useAuth } from "../../../src/lib/auth";
import { api } from "../../../src/lib/api";
import { colors } from "../../../src/theme/colors";

const CHANNELS: Array<"all" | ChannelType> = ["all", "whatsapp", "messenger", "instagram", "web"];
const MODES: Array<"human" | "bot" | "all"> = ["human", "bot", "all"];
const STATUSES: Array<"all" | "active"> = ["all", "active"];

function nextValue<T>(items: T[], current: T): T {
  const index = items.indexOf(current);
  return items[(index + 1) % items.length] ?? items[0];
}

function modeLabel(value: "human" | "bot" | "all"): string {
  if (value === "human") return "Needs agent";
  if (value === "bot") return "Bot";
  return "All";
}

function channelLabel(value: "all" | ChannelType): string {
  return value === "all" ? "All channels" : value;
}

function statusLabel(value: "all" | "active"): string {
  return value === "all" ? "Any status" : "Active";
}

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
      <View style={styles.filterPanel}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search customer, channel, intent, product"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
        />
        <View style={styles.compactFilters}>
          <Pressable
            style={[styles.filterButton, mode !== "all" && styles.filterButtonActive]}
            onPress={() => setMode(nextValue(MODES, mode))}
          >
            <Text style={[styles.filterLabel, mode !== "all" && styles.filterLabelActive]}>
              {modeLabel(mode)}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterButton, channel !== "all" && styles.filterButtonActive]}
            onPress={() => setChannel(nextValue(CHANNELS, channel))}
          >
            <Text style={[styles.filterLabel, channel !== "all" && styles.filterLabelActive]}>
              {channelLabel(channel)}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterButton, status !== "all" && styles.filterButtonActive]}
            onPress={() => setStatus(nextValue(STATUSES, status))}
          >
            <Text style={[styles.filterLabel, status !== "all" && styles.filterLabelActive]}>
              {statusLabel(status)}
            </Text>
          </Pressable>
        </View>
      </View>

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
  filterPanel: {
    backgroundColor: colors.listBg,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 8,
    gap: 8,
  },
  searchInput: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 9,
    color: colors.text,
    fontSize: 14,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  compactFilters: { flexDirection: "row", gap: 6 },
  filterButton: {
    flex: 1,
    minHeight: 32,
    borderRadius: 8,
    backgroundColor: colors.softSurface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  filterButtonActive: { backgroundColor: colors.primary },
  filterLabel: {
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 10,
    textAlign: "center",
  },
  filterLabelActive: { color: colors.headerText },
  list: {
    backgroundColor: colors.listBg,
    borderRadius: 12,
    overflow: "hidden",
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
