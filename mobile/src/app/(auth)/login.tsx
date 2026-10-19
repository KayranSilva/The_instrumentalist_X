import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Field, Notice } from "@/components/ui";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/theme";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const params = useLocalSearchParams<{ registered?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [recovery, setRecovery] = useState({ open: false, sent: "", error: "" });
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [sending, setSending] = useState(false);

  async function sendRecovery() {
    const normalized = recoveryEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) { setRecovery({ ...recovery, error: "Digite um e-mail válido." }); return; }
    setSending(true);
    // Sem redirectTo: o Supabase usa o Site URL, e o login do site já
    // encaminha o link de recuperação para reset.html.
    const { error } = await supabase.auth.resetPasswordForEmail(normalized);
    setSending(false);
    if (error) setRecovery({ ...recovery, error: friendlyError(error, "Não foi possível iniciar a recuperação.") });
    else setRecovery({ ...recovery, error: "", sent: "Se o e-mail estiver cadastrado, você receberá o link de redefinição em instantes." });
  }

  async function submit() {
    const normalized = email.trim().toLowerCase();
    const next: typeof errors = {};
    if (!normalized) next.email = "Informe seu e-mail.";
    else if (!EMAIL_PATTERN.test(normalized)) next.email = "Digite um e-mail válido.";
    if (!password) next.password = "Informe sua senha.";
    setErrors(next);
    if (next.email || next.password) return;

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: normalized, password });
    setLoading(false);
    // Sucesso: o layout raiz percebe a sessão nova e abre a home.
    if (error) setErrors({ password: friendlyError(error, "Não foi possível entrar.") });
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.logo}>♪</Text>
            <Text style={styles.title}>The Instrumentalist X</Text>
            <Text style={styles.subtitle}>Entre para continuar sua jornada musical.</Text>
          </View>

          <View style={styles.card}>
            {params.registered === "confirm" && (
              <Notice kind="success">Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre aqui.</Notice>
            )}
            <Field
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              placeholder="voce@exemplo.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <Field
              label="Senha"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              placeholder="Sua senha"
              secure
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={submit}
              returnKeyType="go"
            />
            <Button title="Entrar" onPress={submit} loading={loading} />
            <Pressable onPress={() => { setRecoveryEmail(email); setRecovery({ open: true, sent: "", error: "" }); }} accessibilityRole="button">
              <Text style={styles.forgot}>Esqueci minha senha</Text>
            </Pressable>
          </View>

          <Text style={styles.footer}>
            Ainda não tem conta?{" "}
            <Link href="/register" style={styles.link}>Cadastre-se</Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={recovery.open} transparent animationType="fade" onRequestClose={() => setRecovery({ ...recovery, open: false })}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Redefinir senha</Text>
            {recovery.sent ? (
              <Notice kind="success">{recovery.sent}</Notice>
            ) : (
              <>
                <Text style={styles.subtitle}>Enviaremos um link para você criar uma nova senha. O link abre o site.</Text>
                <Field
                  label="E-mail da conta"
                  value={recoveryEmail}
                  onChangeText={setRecoveryEmail}
                  error={recovery.error}
                  placeholder="voce@exemplo.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
                <Button title="Enviar link" onPress={sendRecovery} loading={sending} />
              </>
            )}
            <Button title="Fechar" variant="secondary" onPress={() => setRecovery({ ...recovery, open: false })} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 20, gap: 24 },
  brand: { alignItems: "center", gap: 6 },
  logo: { fontSize: 40, color: colors.violet500 },
  title: { fontSize: 26, fontWeight: "800", color: colors.violet900 },
  subtitle: { color: colors.inkSoft, fontSize: 15, textAlign: "center" },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 20, gap: 16 },
  footer: { textAlign: "center", color: colors.inkSoft, fontSize: 15 },
  link: { color: colors.violet700, fontWeight: "700" },
  forgot: { color: colors.violet700, fontWeight: "600", textAlign: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(28,21,48,0.55)", justifyContent: "center", padding: 20 },
  modal: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 20, gap: 14 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.violet900 },
});
