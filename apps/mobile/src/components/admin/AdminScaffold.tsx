import { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";

export function AdminScaffold({
  title,
  subtitle,
  children,
  loading,
  error,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  loading?: boolean;
  error?: string | null;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} style={styles.headerAction}>
            <Text style={styles.headerActionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

export function Section({
  title,
  children,
  actionLabel,
  onAction,
}: {
  title: string;
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={styles.sectionAction}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </View>
  );
}

export function InfoRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value?: string | number | null;
  tone?: "default" | "good" | "warn" | "danger";
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, toneStyles[tone]]}>{value ?? "Not set"}</Text>
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <Text style={styles.empty}>{message}</Text>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, danger && styles.buttonDanger, disabled && styles.buttonDisabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  secureTextEntry,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "url";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
    </View>
  );
}

const toneStyles = StyleSheet.create({
  default: { color: colors.text },
  good: { color: colors.primary },
  warn: { color: "#A16207" },
  danger: { color: colors.danger },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerText: { flex: 1 },
  title: { color: colors.headerText, fontSize: 20, fontWeight: "800" },
  subtitle: { color: "rgba(255,255,255,0.86)", marginTop: 2, fontSize: 12 },
  headerAction: {
    borderColor: "rgba(255,255,255,0.5)",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  headerActionText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  errorBar: { backgroundColor: "#FDECEA", padding: 8 },
  errorText: { color: colors.danger, textAlign: "center", fontSize: 12 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  content: { padding: 10, gap: 10, paddingBottom: 24 },
  section: {
    backgroundColor: colors.listBg,
    borderRadius: 12,
    padding: 10,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  sectionAction: { color: colors.primary, fontWeight: "700", fontSize: 12 },
  metric: {
    backgroundColor: colors.softSurface,
    borderRadius: 10,
    padding: 10,
    flex: 1,
    minWidth: "47%",
  },
  metricLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  metricValue: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 2 },
  metricDetail: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    gap: 10,
  },
  rowLabel: { color: colors.textMuted, fontSize: 12, flex: 1 },
  rowValue: { color: colors.text, fontSize: 13, fontWeight: "700", textAlign: "right", flex: 1 },
  empty: { color: colors.textMuted, textAlign: "center", paddingVertical: 12, fontSize: 12 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: "center",
  },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  field: { gap: 4 },
  fieldLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
    minHeight: 38,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  inputMultiline: { minHeight: 68, textAlignVertical: "top" },
});
