import type { Conversation } from "@commercechat/mock-api";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { Avatar } from "./Avatar";

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ConversationRow({
  item,
  onPress,
}: {
  item: Conversation;
  onPress: () => void;
}) {
  const name = item.customerName ?? item.externalUserId;
  const isHuman = item.handlingMode === "human";

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Avatar name={name} />
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.time}>{formatTime(item.updatedAt)}</Text>
        </View>
        <View style={styles.bottom}>
          <Text style={styles.preview} numberOfLines={1}>
            {item.channel} · {item.messageCount} messages
          </Text>
          {isHuman && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Agent</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.listBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 14,
  },
  body: { flex: 1 },
  top: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  name: { flex: 1, fontSize: 17, fontWeight: "600", color: colors.text },
  time: { fontSize: 12, color: colors.textMuted },
  bottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  preview: { flex: 1, fontSize: 14, color: colors.textMuted },
  badge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
