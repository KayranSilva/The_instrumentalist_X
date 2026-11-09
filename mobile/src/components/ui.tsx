import { useState, type ReactNode } from "react";
import {
  ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps,
} from "react-native";

import { colors, radius } from "@/theme";

export function Button({ title, onPress, loading, variant = "primary", disabled }: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (pressed || disabled || loading) && { opacity: 0.75 },
      ]}
    >
      {loading
        ? <ActivityIndicator color={primary ? colors.white : colors.violet700} />
        : <Text style={[styles.buttonText, !primary && { color: colors.violet700 }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, secure, style, ...input }: TextInputProps & {
  label: string;
  error?: string;
  secure?: boolean;
}) {
  const [hidden, setHidden] = useState(true);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, error ? styles.inputError : null]}>
        <TextInput
          placeholderTextColor={colors.inkSoft}
          style={[styles.input, style]}
          secureTextEntry={secure && hidden}
          {...input}
        />
        {secure && (
          <Pressable
            onPress={() => setHidden(!hidden)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Mostrar senha" : "Ocultar senha"}
            hitSlop={8}
          >
            <Text style={styles.toggle}>{hidden ? "Mostrar" : "Ocultar"}</Text>
          </Pressable>
        )}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Notice({ kind, children }: { kind: "info" | "success" | "error"; children: ReactNode }) {
  const tint = kind === "error" ? colors.danger : kind === "success" ? colors.success : colors.violet700;
  return (
    <View style={[styles.notice, { borderColor: tint }]}>
      <Text style={[styles.noticeText, { color: tint }]}>{children}</Text>
    </View>
  );
}

export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || "•";
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (url && /^https?:\/\//i.test(url)) return <Image source={{ uri: url }} style={[box, { backgroundColor: colors.lavender100 }]} />;
  return (
    <View style={[box, styles.avatar]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

/** Opções lado a lado (chips), com uma selecionada. */
export function Chips<T extends string>({ options, value, onChange, disabled }: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled && !selected}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: disabled && !selected }}
            style={[styles.chip, selected && styles.chipSelected, disabled && !selected && { opacity: 0.4 }]}
          >
            <Text style={[styles.chipText, selected && { color: colors.white }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Abas segmentadas no topo de uma tela. */
export function Segmented<T extends string>({ options, value, onChange }: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && { color: colors.violet800 }]} numberOfLines={1}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function RolePill({ role }: { role: string }) {
  if (role !== "admin" && role !== "teacher") return null;
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{role === "admin" ? "Admin" : "Professor"}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.violet500} />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={[styles.center, { padding: 24, gap: 16 }]}>
      <Text style={{ color: colors.ink, textAlign: "center" }}>{message}</Text>
      <Button title="Tentar de novo" variant="secondary" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", minHeight: 50 },
  buttonPrimary: { backgroundColor: colors.violet700 },
  buttonSecondary: { backgroundColor: colors.lavender100, borderWidth: 1, borderColor: colors.violet300 },
  buttonText: { color: colors.white, fontWeight: "700", fontSize: 16 },
  field: { gap: 6 },
  label: { color: colors.ink, fontWeight: "600", fontSize: 14 },
  inputRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.white, borderWidth: 1,
    borderColor: colors.violet300, borderRadius: radius.sm, paddingHorizontal: 14,
  },
  inputError: { borderColor: colors.danger },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.ink },
  toggle: { color: colors.violet700, fontWeight: "600", paddingLeft: 8 },
  error: { color: colors.danger, fontSize: 13 },
  notice: { borderWidth: 1, borderRadius: radius.sm, padding: 12, backgroundColor: colors.white },
  noticeText: { fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.lavender050 },
  avatar: { backgroundColor: colors.violet300, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.violet900, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1,
    borderColor: colors.violet300, backgroundColor: colors.white,
  },
  chipSelected: { backgroundColor: colors.violet700, borderColor: colors.violet700 },
  chipText: { color: colors.violet800, fontWeight: "600" },
  segmented: { flexDirection: "row", backgroundColor: colors.lavender100, borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: "center" },
  segmentSelected: { backgroundColor: colors.white },
  segmentText: { color: colors.inkSoft, fontWeight: "700", fontSize: 13 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.lavender100 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
  pill: { backgroundColor: colors.yellow400, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { color: colors.violet900, fontWeight: "800", fontSize: 11 },
});
