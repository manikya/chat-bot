import type { Message } from "@commercechat/mock-api";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { MessageText } from "./MessageText";

export function ChatBubble({ message }: { message: Message }) {
  const outbound = message.direction === "outbound";
  const manual = Boolean(message.metadata?.manual);
  const handoff = Boolean(message.metadata?.handoff);

  return (
    <View style={[styles.wrap, outbound ? styles.wrapOut : styles.wrapIn]}>
      <View
        style={[
          styles.bubble,
          outbound ? (manual ? styles.bubbleManual : styles.bubbleOut) : styles.bubbleIn,
        ]}
      >
        <MessageText content={message.content} style={styles.text} />
        <View style={styles.meta}>
          {manual && <Text style={styles.tag}>You</Text>}
          {handoff && <Text style={styles.tag}>Handoff</Text>}
          <Text style={styles.time}>
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 2, paddingHorizontal: 8 },
  wrapIn: { alignItems: "flex-start" },
  wrapOut: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "82%",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleIn: { backgroundColor: colors.bubbleIn },
  bubbleOut: { backgroundColor: colors.bubbleOut },
  bubbleManual: { backgroundColor: colors.bubbleManual },
  text: { fontSize: 16, color: colors.text, lineHeight: 22 },
  meta: { flexDirection: "row", justifyContent: "flex-end", gap: 6, marginTop: 4 },
  tag: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  time: { fontSize: 11, color: colors.textMuted },
});
