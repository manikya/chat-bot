import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Conversation } from "@commercechat/mock-api";
import { useFocusEffect } from "@react-navigation/native";
import { ConversationRow } from "../src/components/ConversationRow";
import { useAuth } from "../src/lib/auth";
import { api } from "../src/lib/api";
import { colors } from "../src/theme/colors";

export default function InboxScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading, tenant, logout, user } = useAuth();
  const [items, setItems] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState<"all" | "human">("human");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await api.conversations.list({
      handlingMode: filter === "human" ? "human" : undefined,
    });
    setItems(res.data.items);
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load()
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, [load])
  );

  if (!isLoading && !isAuthenticated) return <Redirect href="/login" />;

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Chats</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {tenant?.storeName ?? "CommerceChat"} · {user?.name}
          </Text>
        </View>
        <Pressable onPress={() => logout()} hitSlop={12}>
          <Text style={styles.logout}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <Pressable
          style={[styles.chip, filter === "human" && styles.chipActive]}
          onPress={() => setFilter("human")}
        >
          <Text style={[styles.chipText, filter === "human" && styles.chipTextActive]}>
            Needs agent
          </Text>
        </Pressable>
        <Pressable
          style={[styles.chip, filter === "all" && styles.chipActive]}
          onPress={() => setFilter("all")}
        >
          <Text style={[styles.chipText, filter === "all" && styles.chipTextActive]}>All</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.conversationId}
          renderItem={({ item }) => (
            <ConversationRow
              item={item}
              onPress={() => router.push(`/thread/${item.conversationId}`)}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {filter === "human" ? "No conversations need an agent." : "No conversations yet."}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.listBg },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 22, fontWeight: "700", color: colors.headerText },
  subtitle: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2, maxWidth: 240 },
  logout: { color: "rgba(255,255,255,0.9)", fontSize: 14 },
  filters: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.primaryDark,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  chipActive: { backgroundColor: colors.listBg },
  chipText: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.primary },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 48, paddingHorizontal: 24 },
});
