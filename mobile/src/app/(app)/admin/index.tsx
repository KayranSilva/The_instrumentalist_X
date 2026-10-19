import * as Linking from "expo-linking";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Button, Chips, ErrorState, Loading, Notice } from "@/components/ui";
import { deleteContent, listContent, TYPE_LABEL, type AdminContent } from "@/lib/admin";
import { friendlyError } from "@/lib/errors";
import { isStaff, useMyProfile } from "@/lib/useMyProfile";
import { colors, radius } from "@/theme";

type Filter = "todos" | "aula" | "musica" | "partitura" | "rascunho";
const SYMBOL = { aula: "▶", musica: "♪", partitura: "♫" } as const;

export default function AdminContentList() {
  const { me } = useMyProfile();
  const [contents, setContents] = useState<AdminContent[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setContents(await listContent());
      setError("");
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar o catálogo."));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (contents || []).filter((item) => {
      if (filter === "rascunho" ? item.published : filter !== "todos" && item.type !== filter) return false;
      return !text || [item.title, item.instrument, item.teacher].some((value) => value.toLowerCase().includes(text));
    });
  }, [contents, query, filter]);

  if (me && !isStaff(me.role)) return <ErrorState message="Apenas professores e administradores acessam o painel." onRetry={() => router.back()} />;
  if (!contents) return error ? <ErrorState message={error} onRetry={load} /> : <Loading />;

  const published = contents.filter((item) => item.published).length;
  const drafts = contents.length - published;

  function remove(item: AdminContent) {
    Alert.alert("Excluir conteúdo", `Excluir "${item.title}"? O arquivo enviado também será apagado. Essa ação não pode ser desfeita.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir", style: "destructive", onPress: async () => {
          try {
            await deleteContent(item.id);
            await load();
          } catch (err) {
            Alert.alert("Ops", friendlyError(err, "Não foi possível excluir."));
          }
        },
      },
    ]);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.violet500}
        onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Stack.Screen options={{
        headerRight: me?.role === "admin"
          ? () => <Pressable onPress={() => router.push("/admin/users")} hitSlop={8}><Text style={styles.headerLink}>Usuários</Text></Pressable>
          : undefined,
      }} />

      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statValue}>{published}</Text>
          <Text style={styles.statLabel}>{drafts ? `publicados · + ${drafts} ${drafts === 1 ? "rascunho" : "rascunhos"}` : "visíveis para os alunos"}</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{contents.filter((item) => item.type === "aula").length}</Text><Text style={styles.statLabel}>aulas</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{contents.filter((item) => item.type !== "aula").length}</Text><Text style={styles.statLabel}>materiais</Text></View>
      </View>

      <Button title="+ Publicar novo conteúdo" onPress={() => router.push("/admin/form")} />

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar por título, instrumento ou professor…"
        placeholderTextColor={colors.inkSoft}
        style={styles.search}
      />
      <Chips
        value={filter}
        onChange={setFilter}
        options={[{ value: "todos", label: "Todos" }, { value: "aula", label: "Aulas" }, { value: "musica", label: "Músicas" },
          { value: "partitura", label: "Partituras" }, { value: "rascunho", label: "Rascunhos" }]}
      />
      <Text style={styles.count}>{visible.length} {visible.length === 1 ? "item" : "itens"}</Text>
      {error ? <Notice kind="error">{error}</Notice> : null}

      {visible.length ? visible.map((item) => (
        <View key={item.id} style={styles.item}>
          <View style={[styles.symbol, styles[item.type]]}><Text style={styles.symbolText}>{SYMBOL[item.type]}</Text></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}{item.published ? "" : "  "}
              {!item.published && <Text style={styles.draft}> Rascunho </Text>}
            </Text>
            <Text style={styles.meta} numberOfLines={2}>{[TYPE_LABEL[item.type], item.instrument, item.level, item.teacher].filter(Boolean).join(" · ")}</Text>
            <View style={styles.actions}>
              {/^https?:\/\//i.test(item.url) && (
                <Pressable onPress={() => Linking.openURL(item.url)} hitSlop={6}><Text style={styles.action}>Abrir ↗</Text></Pressable>
              )}
              <Pressable onPress={() => router.push({ pathname: "/admin/form", params: { id: item.id } })} hitSlop={6}>
                <Text style={styles.action}>Editar</Text>
              </Pressable>
              <Pressable onPress={() => remove(item)} hitSlop={6}><Text style={[styles.action, { color: colors.danger }]}>Excluir</Text></Pressable>
            </View>
          </View>
        </View>
      )) : (
        <Text style={styles.empty}>
          {contents.length ? "Nenhum conteúdo encontrado." : "Nenhum conteúdo publicado ainda. Toque em \"Publicar novo conteúdo\" para criar o primeiro."}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  headerLink: { color: colors.violet700, fontWeight: "700" },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.lavender100 },
  statValue: { fontSize: 22, fontWeight: "800", color: colors.violet900 },
  statLabel: { color: colors.inkSoft, fontSize: 12 },
  search: {
    borderWidth: 1, borderColor: colors.violet300, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: colors.ink, backgroundColor: colors.white,
  },
  count: { color: colors.inkSoft, fontSize: 13 },
  item: { flexDirection: "row", gap: 12, backgroundColor: colors.white, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.lavender100 },
  symbol: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  aula: { backgroundColor: colors.lavender100 },
  musica: { backgroundColor: "#dff4ef" },
  partitura: { backgroundColor: "#fdf1d6" },
  symbolText: { color: colors.violet800, fontWeight: "800", fontSize: 16 },
  title: { color: colors.ink, fontWeight: "700", fontSize: 15 },
  draft: { color: colors.violet900, backgroundColor: colors.yellow400, fontSize: 11, fontWeight: "800" },
  meta: { color: colors.inkSoft, fontSize: 13 },
  actions: { flexDirection: "row", gap: 18, marginTop: 6 },
  action: { color: colors.violet700, fontWeight: "700" },
  empty: { color: colors.inkSoft, textAlign: "center", marginTop: 16 },
});
