import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";

import { LessonCard } from "@/components/LessonCard";
import { ErrorState, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { fetchLessonGroups, type LessonGroup } from "@/lib/content";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme";

export default function ContentList() {
  const { session } = useAuth();
  const params = useLocalSearchParams<{ instrument?: string }>();
  const [groups, setGroups] = useState<LessonGroup[] | null>(null);
  const [filter, setFilter] = useState<string>(params.instrument || "todos");

  // "Explore por instrumento" na home abre esta aba já filtrada.
  useEffect(() => { if (params.instrument) setFilter(params.instrument); }, [params.instrument]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const { data } = await supabase
        .from("profile_instruments")
        .select("instruments(slug)")
        .eq("profile_id", session.user.id)
        .eq("is_primary", true)
        .maybeSingle();
      const primary = (data?.instruments as unknown as { slug: string } | null)?.slug;
      setGroups(await fetchLessonGroups(primary));
      setError("");
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar os conteúdos."));
    }
  }, [session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sections = useMemo(
    () => (groups || [])
      .filter((group) => filter === "todos" || group.instrumentSlug === filter)
      .map((group) => ({ key: group.instrumentSlug, title: group.instrumentName, isPrimary: group.isPrimary, data: group.lessons })),
    [groups, filter],
  );

  if (!groups) return error ? <ErrorState message={error} onRetry={load} /> : <Loading />;

  const chips = [{ slug: "todos", name: "Todos" }, ...groups.map((g) => ({ slug: g.instrumentSlug, name: g.instrumentName }))];

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          tintColor={colors.violet500}
        />
      }
      ListHeaderComponent={
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {chips.map((chip) => {
            const selected = chip.slug === filter;
            return (
              <Pressable
                key={chip.slug}
                onPress={() => setFilter(chip.slug)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && { color: colors.white }]}>{chip.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      }
      renderSectionHeader={({ section }) => (
        <Text style={styles.section}>
          {section.title}{section.isPrimary ? "  ·  seu instrumento" : ""}
        </Text>
      )}
      renderItem={({ item }) => <LessonCard lesson={item} />}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={
        <Text style={styles.empty}>{groups.length ? "Ainda não há conteúdos para este instrumento. Em breve!" : "Nenhum conteúdo publicado ainda."}</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32 },
  chips: { gap: 8, paddingBottom: 4 },
  chip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1,
    borderColor: colors.violet300, backgroundColor: colors.white,
  },
  chipSelected: { backgroundColor: colors.violet700, borderColor: colors.violet700 },
  chipText: { color: colors.violet800, fontWeight: "600" },
  section: { fontSize: 17, fontWeight: "800", color: colors.ink, marginTop: 20, marginBottom: 10 },
  empty: { color: colors.inkSoft, textAlign: "center", marginTop: 32 },
});
