import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { AuthForm } from "../src/components/AuthForm";
import { TextField } from "../src/components/admin/AdminScaffold";
import { useAuth } from "../src/lib/auth";
import { api } from "../src/lib/api";
import { colors } from "../src/theme/colors";

export default function AcceptInviteScreen() {
  const { isAuthenticated, isLoading, refreshMe } = useAuth();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const initialToken = Array.isArray(params.token) ? params.token[0] : params.token ?? "";
  const [token, setToken] = useState(initialToken);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoading && isAuthenticated) return <Redirect href="/(tabs)/home" />;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.auth.acceptInvite({ token: token.trim(), name: name.trim(), password });
      await refreshMe();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Could not accept invite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthForm title="Accept invite" subtitle="Join your team and set your password.">
      <TextField label="Invite token" value={token} onChangeText={setToken} />
      <TextField label="Name" value={name} onChangeText={setName} />
      <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={submit}
        disabled={busy || !token || !password}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Accept invite</Text>}
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
