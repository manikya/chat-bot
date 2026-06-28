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
  const context = [
    item.channel,
    item.funnelStage,
    item.lastIntent,
    item.cart?.firstItemName,
    item.cart?.abandoned ? "abandoned cart" : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Avatar name={name} size={40} />
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.time}>{formatTime(item.updatedAt)}</Text>
        </View>
        <View style={styles.bottom}>
          <Text style={styles.preview} numberOfLines={1}>
            {context || `${item.messageCount} messages`}
          </Text>
          {isHuman && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Agent</Text>
            </View>
          )}
          {item.assignedToUserId && (
            <View style={styles.assignmentBadge}>
              <Text style={styles.assignmentText}>Assigned</Text>
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
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.listBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 10,
  },
  body: { flex: 1 },
  top: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  name: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.text },
  time: { fontSize: 11, color: colors.textMuted },
  bottom: { flexDirection: "row", alignItems: "center", gap: 6 },
  preview: { flex: 1, fontSize: 12, color: colors.textMuted },
  badge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 9,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  assignmentBadge: {
    backgroundColor: colors.softSurface,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 9,
  },
  assignmentText: { color: colors.primary, fontSize: 10, fontWeight: "700" },
});
