import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Field, Notice } from "@/components/ui";
import { fetchInstruments, type Instrument } from "@/lib/content";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/theme";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Reserva caso a lista do banco não carregue (o trigger valida o slug).
const FALLBACK_INSTRUMENTS: Instrument[] = [
  { slug: "bateria", name: "Bateria" }, { slug: "canto", name: "Canto" },
  { slug: "composicao", name: "Composição" }, { slug: "guitarra", name: "Guitarra" },
  { slug: "piano", name: "Piano" }, { slug: "ukulele", name: "Ukulele" },
  { slug: "violao", name: "Violão" }, { slug: "violino", name: "Violino" },
];

type Errors = { name?: string; email?: string; password?: string; confirm?: string; instrument?: string; form?: string };

export default function Register() {
  const [instruments, setInstruments] = useState<Instrument[]>(FALLBACK_INSTRUMENTS);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [instrument, setInstrument] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchInstruments().then((list) => { if (list.length) setInstruments(list); }).catch(() => { /* usa a reserva */ });
  }, []);

  async function submit() {
    const cleanName = name.split(/\s+/).filter(Boolean).join(" ");
    const cleanEmail = email.trim().toLowerCase();
    const next: Errors = {};
    if (cleanName.length < 2 || cleanName.length > 80) next.name = "Informe seu nome (2 a 80 caracteres).";
    if (!EMAIL_PATTERN.test(cleanEmail)) next.email = "Digite um e-mail válido.";
    if (password.length < 6) next.password = "A senha deve ter pelo menos 6 caracteres.";
    else if (password.length > 72) next.password = "A senha pode ter no máximo 72 caracteres.";
    if (confirm !== password) next.confirm = "As senhas não conferem.";
    if (!instrument) next.instrument = "Escolha um instrumento.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    // O trigger handle_new_user cria o perfil e grava o instrumento
    // principal a partir destes metadados (igual ao cadastro do site).
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { name: cleanName, instrument } },
    });
    setLoading(false);

    if (error) {
      const message = friendlyError(error, "Não foi possível criar a conta.");
      setErrors(message.toLowerCase().includes("e-mail") ? { email: message } : { form: message });
      return;
    }
    // Com confirmação ligada, e-mail já cadastrado volta sem erro e sem identidades.
    if (data.user && data.user.identities?.length === 0) {
      setErrors({ email: "Este e-mail já está cadastrado." });
      return;
    }
    // Sem sessão = precisa confirmar o e-mail (o link abre o site). Com sessão,
    // o layout raiz já leva para a home.
    if (!data.session) router.replace({ pathname: "/login", params: { registered: "confirm" } });
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6 }}>
            <Text style={styles.title}>Criar conta</Text>
            <Text style={styles.subtitle}>Escolha seu instrumento e comece a aprender.</Text>
          </View>

          <View style={styles.card}>
            {errors.form ? <Notice kind="error">{errors.form}</Notice> : null}
            <Field label="Nome" value={name} onChangeText={setName} error={errors.name}
              placeholder="Seu nome" autoComplete="name" textContentType="name" />
            <Field label="E-mail" value={email} onChangeText={setEmail} error={errors.email}
              placeholder="voce@exemplo.com" keyboardType="email-address" autoCapitalize="none"
              autoComplete="email" textContentType="emailAddress" />
            <Field label="Senha" value={password} onChangeText={setPassword} error={errors.password}
              placeholder="Mínimo de 6 caracteres" secure autoComplete="new-password" textContentType="newPassword" />
            <Field label="Confirmar senha" value={confirm} onChangeText={setConfirm} error={errors.confirm}
              placeholder="Repita a senha" secure autoComplete="new-password" textContentType="newPassword" />

            <View style={{ gap: 8 }}>
              <Text style={styles.label}>Instrumento principal</Text>
              <View style={styles.grid}>
                {instruments.map((item) => {
                  const selected = item.slug === instrument;
                  return (
                    <Pressable
                      key={item.slug}
                      onPress={() => setInstrument(item.slug)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{item.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {errors.instrument ? <Text style={styles.error}>{errors.instrument}</Text> : null}
            </View>

            <Button title="Criar conta" onPress={submit} loading={loading} />
          </View>

          <Text style={styles.footer}>
            Já tem conta? <Link href="/login" style={styles.link}>Entrar</Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 20, gap: 20 },
  title: { fontSize: 26, fontWeight: "800", color: colors.violet900 },
  subtitle: { color: colors.inkSoft, fontSize: 15 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 20, gap: 16 },
  label: { color: colors.ink, fontWeight: "600", fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1,
    borderColor: colors.violet300, backgroundColor: colors.lavender050,
  },
  chipSelected: { backgroundColor: colors.violet700, borderColor: colors.violet700 },
  chipText: { color: colors.violet800, fontWeight: "600" },
  chipTextSelected: { color: colors.white },
  error: { color: colors.danger, fontSize: 13 },
  footer: { textAlign: "center", color: colors.inkSoft, fontSize: 15 },
  link: { color: colors.violet700, fontWeight: "700" },
});
