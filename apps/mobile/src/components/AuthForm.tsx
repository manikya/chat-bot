import { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

export function AuthForm({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.logo}>CommerceChat</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <View style={styles.card}>{children}</View>
          {footer ?? (
            <Link href="/login" asChild>
              <Pressable style={styles.backLink}>
                <Text style={styles.backText}>Back to sign in</Text>
              </Pressable>
            </Link>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24, paddingBottom: 40 },
  header: { marginBottom: 24, alignItems: "center" },
  logo: { fontSize: 26, fontWeight: "800", color: "#fff" },
  title: { fontSize: 18, fontWeight: "800", color: "#fff", marginTop: 12 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 6, textAlign: "center" },
  card: { backgroundColor: colors.listBg, borderRadius: 12, padding: 20, gap: 10 },
  backLink: { alignItems: "center", marginTop: 18 },
  backText: { color: "#fff", fontWeight: "800" },
});
