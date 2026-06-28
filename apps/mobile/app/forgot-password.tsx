import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { AuthForm } from "../src/components/AuthForm";
import { TextField } from "../src/components/admin/AdminScaffold";
import { api } from "../src/lib/api";
import { colors } from "../src/theme/colors";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.auth.forgotPassword(email.trim());
      setMessage("If an account exists, reset instructions have been sent.");
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not request reset");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthForm title="Reset password" subtitle="Send reset instructions to your email.">
      <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={submit} disabled={busy || !email}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send reset link</Text>}
      </Pressable>
    </AuthForm>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "800" },
  message: { color: colors.primary, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 13 },
});
