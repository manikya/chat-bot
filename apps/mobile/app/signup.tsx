import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { Redirect } from "expo-router";
import { AuthForm } from "../src/components/AuthForm";
import { TextField } from "../src/components/admin/AdminScaffold";
import { useAuth } from "../src/lib/auth";
import { api } from "../src/lib/api";
import { colors } from "../src/theme/colors";

export default function SignupScreen() {
  const { isAuthenticated, isLoading, refreshMe } = useAuth();
  const [storeName, setStoreName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoading && isAuthenticated) return <Redirect href="/(tabs)/home" />;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.auth.signup({ storeName: storeName.trim(), name: name.trim(), email: email.trim(), password });
      await refreshMe();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthForm title="Create account" subtitle="Start managing CommerceChat from mobile.">
      <TextField label="Store name" value={storeName} onChangeText={setStoreName} />
      <TextField label="Your name" value={name} onChangeText={setName} />
      <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={submit}
        disabled={busy || !storeName || !email || !password}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create account</Text>}
      </Pressable>
    </AuthForm>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "800" },
  error: { color: colors.danger, fontSize: 13 },
});
