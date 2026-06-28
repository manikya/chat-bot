import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AuthForm } from "../src/components/AuthForm";
import { TextField } from "../src/components/admin/AdminScaffold";
import { api } from "../src/lib/api";
import { colors } from "../src/theme/colors";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[]; email?: string | string[] }>();
  const initialToken = Array.isArray(params.token) ? params.token[0] : params.token ?? "";
  const initialEmail = Array.isArray(params.email) ? params.email[0] : params.email ?? "";
  const [token, setToken] = useState(initialToken);
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      await api.auth.verifyEmail(token.trim());
      router.replace("/login");
    } catch (e) {
      setError((e as { message?: string }).message ?? "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.auth.resendVerification(email.trim());
      setMessage("Verification email sent.");
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not resend verification");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthForm title="Verify email" subtitle="Verify your email or resend the verification link.">
      <TextField label="Verification token" value={token} onChangeText={setToken} />
      <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={verify} disabled={busy || !token}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify email</Text>}
      </Pressable>
      <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <Pressable
        style={[styles.secondaryButton, busy && styles.buttonDisabled]}
        onPress={resend}
        disabled={busy || !email}
      >
        <Text style={styles.secondaryText}>Resend verification</Text>
      </Pressable>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </AuthForm>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  secondaryButton: {
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "800" },
  secondaryText: { color: colors.primary, fontWeight: "800" },
  message: { color: colors.primary, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 13 },
});
