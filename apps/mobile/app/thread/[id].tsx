import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ConversationDetail, Message } from "@commercechat/mock-api";
import { Ionicons } from "@expo/vector-icons";
import { ChatBubble } from "../../src/components/ChatBubble";
import { ScreenErrorBoundary } from "../../src/components/ScreenErrorBoundary";
import { api } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors } from "../../src/theme/colors";

const META = new Set(["whatsapp", "messenger", "instagram"]);

export default function ThreadScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useAuth();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  const canAct = user?.role === "owner" || user?.role === "admin";
  const isHuman = detail?.handlingMode === "human";
  const manualSupported =
    detail?.manualReplySupported ?? (detail ? META.has(detail.channel) : false);
  const canReply = canAct && isHuman && manualSupported;

  const reload = useCallback(async () => {
    if (!id) return;
    const [d, m] = await Promise.all([
      api.conversations.get(id),
      api.conversations.getMessages(id),
    ]);
    setDetail(d.data);
    setMessages(m.data.items);
  }, [id]);

  useEffect(() => {
    reload().catch(() => setError("Failed to load thread"));
  }, [reload]);

  useEffect(() => {
    if (!messages.length) return;
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: false });
    }, 100);
    return () => clearTimeout(t);
  }, [messages]);

  async function setMode(mode: "bot" | "human", notifyCustomer?: boolean) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.conversations.setHandling(id, {
        mode,
        notifyCustomer,
        assignedToUserId: mode === "human" ? user?.userId : undefined,
      });
      await reload();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!id || !reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.conversations.reply(id, reply.trim());
      setReply("");
      await reload();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Send failed");
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const title = detail.customerName ?? "Customer";

  return (
    <ScreenErrorBoundary label="thread">
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerSub}>
            {detail.channel} · {isHuman ? "Human" : "Bot"}
          </Text>
        </View>
        {canAct && (
          <Pressable
            onPress={() => (isHuman ? setMode("bot") : setMode("human", true))}
            disabled={busy}
            hitSlop={8}
          >
            <Ionicons
              name={isHuman ? "hardware-chip-outline" : "person-outline"}
              size={22}
              color="#fff"
            />
          </Pressable>
        )}
      </View>

      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {(detail.cart || detail.qualification || detail.assignedToUserId) && (
        <View style={styles.contextCard}>
          {detail.cart && (
            <Text style={styles.contextLine}>
              Cart: {detail.cart.itemCount} item(s) · {detail.cart.currency} {detail.cart.subtotal}
              {detail.cart.abandoned ? " · abandoned" : ""}
            </Text>
          )}
          {detail.qualification && (
            <Text style={styles.contextLine} numberOfLines={2}>
              Qualification: {[detail.qualification.category, detail.qualification.recipient]
                .filter(Boolean)
                .join(" · ") || "Captured"}
            </Text>
          )}
          {detail.assignedToUserId && (
            <Text style={styles.contextLine}>Assigned to: {detail.assignedToUserId}</Text>
          )}
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={messages}
          keyExtractor={(m) => m.messageId}
          renderItem={({ item }) => <ChatBubble message={item} />}
          ref={listRef}
        />

        {canAct && !isHuman && (
          <Pressable style={styles.banner} onPress={() => setMode("human", true)} disabled={busy}>
            <Text style={styles.bannerText}>
              {manualSupported
                ? "Take over this chat to reply manually"
                : "Take over (view only — manual reply not supported on this channel)"}
            </Text>
          </Pressable>
        )}

        {canAct && isHuman && !manualSupported && (
          <View style={styles.infoBar}>
            <Text style={styles.infoText}>
              Human mode — manual send is only available for WhatsApp, Messenger, and Instagram.
            </Text>
          </View>
        )}

        {canReply && (
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder="Message"
              placeholderTextColor={colors.textMuted}
              value={reply}
              onChangeText={setReply}
              multiline
              maxLength={4096}
            />
            <Pressable
              style={[styles.send, (!reply.trim() || busy) && styles.sendDisabled]}
              onPress={sendReply}
              disabled={!reply.trim() || busy}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.chatBg },
  flex: { flex: 1 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 8,
  },
  back: { padding: 4 },
  headerText: { flex: 1 },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "600" },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2 },
  errorBar: { backgroundColor: "#FDECEA", padding: 8 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: "center" },
  contextCard: {
    backgroundColor: colors.listBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 3,
  },
  contextLine: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  list: { flex: 1 },
  listContent: { paddingVertical: 8 },
  banner: {
    backgroundColor: colors.primaryDark,
    padding: 12,
    alignItems: "center",
  },
  bannerText: { color: "#fff", fontSize: 14, fontWeight: "500" },
  infoBar: { backgroundColor: "#E8F5E9", paddingHorizontal: 12, paddingVertical: 10 },
  infoText: { color: colors.primaryDark, fontSize: 13, textAlign: "center" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 8,
    gap: 8,
    backgroundColor: colors.listBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: colors.inputBg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.5 },
});
