import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AuthForm } from "../src/components/AuthForm";
import { TextField } from "../src/components/admin/AdminScaffold";
import { api } from "../src/lib/api";
import { colors } from "../src/theme/colors";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const initialToken = Array.isArray(params.token) ? params.token[0] : params.token ?? "";
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.auth.resetPassword(token.trim(), password);
      router.replace("/login");
    } catch (e) {
      setError((e as { message?: string }).message ?? "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthForm title="Set new password" subtitle="Paste your reset token if it was not filled automatically.">
      <TextField label="Reset token" value={token} onChangeText={setToken} />
      <TextField label="New password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={submit}
        disabled={busy || !token || !password}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Update password</Text>}
      </Pressable>
    </AuthForm>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "800" },
  error: { color: colors.danger, fontSize: 13 },
});
