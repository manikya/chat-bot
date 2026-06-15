import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: colors.textMuted,
    fontWeight: "600",
  },
});
