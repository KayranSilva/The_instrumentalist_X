import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LessonCard, openLesson } from "@/components/LessonCard";
import { Button, Card, ErrorState, Loading, SectionTitle } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import {
  fetchInstruments, fetchJourney, fetchLessonGroups, fetchProfile, levelTitle, XP_PER_LEVEL,
  type Instrument, type Journey, type LessonGroup, type Profile,
} from "@/lib/content";
import { friendlyError } from "@/lib/errors";
import { colors, radius } from "@/theme";

const WEEK_DAYS = ["S", "T", "Q", "Q", "S", "S", "D"];
const BADGE_ICON: Record<string, string> = { "primeiro-passo": "🎖️", constancia: "🔥", maratona: "🏆", explorador: "🧭" };

type HomeData = {
  profile: Profile;
  journey: Journey;
  groups: LessonGroup[];
  instruments: Array<Instrument & { count: number; isPrimary: boolean }>;
  total: number;
  completed: number;
};

function greeting(name: string): string {
  const hour = new Date().getHours();
  const hello = hour < 5 ? "Boa noite" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const first = name.trim().split(/\s+/)[0];
  return first ? `${hello}, ${first}.` : `${hello}!`;
}

function heroMessage(done: number, total: number): string {
  if (!total) return "Ainda não há aulas publicadas. Novos conteúdos chegam em breve!";
  if (done >= total) return "Você concluiu todos os conteúdos disponíveis. Novas aulas chegam em breve!";
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Comece o dia afinando sua escuta e avance um pouco na sua próxima aula.";
  if (hour >= 12 && hour < 18) return "Uma pausa para praticar agora deixa sua evolução ainda mais consistente.";
  return "Feche o dia com música: escolha uma aula e continue de onde parou.";
}

export default function Home() {
  const { session } = useAuth();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const profile = await fetchProfile(session.user.id, session.user.email || "");
      const primarySlug = profile.primaryInstrument?.slug;
      const [journey, groups, catalog] = await Promise.all([
        fetchJourney(profile.xpTotal, profile.level),
        fetchLessonGroups(primarySlug),
        fetchInstruments().catch(() => [] as Instrument[]),
      ]);
      const lessons = groups.flatMap((group) => group.lessons);
      const counts = Object.fromEntries(groups.map((group) => [group.instrumentSlug, group.lessons.length]));
      setData({
        profile,
        journey,
        groups,
        instruments: catalog.map((item) => ({ ...item, count: counts[item.slug] || 0, isPrimary: item.slug === primarySlug })),
        total: lessons.length,
        completed: lessons.filter((lesson) => lesson.completed).length,
      });
      setError("");
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar a home."));
    }
  }, [session]);

  // Recarrega ao voltar do player (XP e "concluída" podem ter mudado).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!data) return error ? <ErrorState message={error} onRetry={load} /> : <Loading />;
  const { profile, journey, groups } = data;
  const continueGroup = groups.find((group) => group.lessons.some((lesson) => !lesson.completed));
  const next = continueGroup?.lessons.find((lesson) => !lesson.completed);
  const continueDone = continueGroup ? continueGroup.lessons.filter((lesson) => lesson.completed).length : 0;
  const featured = groups[0];
  const todayIndex = (new Date().getDay() + 6) % 7;
  const practicedToday = Boolean(journey.week[todayIndex]);
  const streakNote = journey.streak
    ? practicedToday
      ? `Você está há ${journey.streak} ${journey.streak === 1 ? "dia" : "dias"} seguidos praticando. Continue amanhã!`
      : `Conclua uma aula hoje para manter seus ${journey.streak} ${journey.streak === 1 ? "dia" : "dias"} seguidos.`
    : "Conclua uma aula hoje para começar sua sequência.";
  const ranking = journey.ranking.filter((entry) => entry.xp > 0 || entry.is_you);
  const someoneScored = ranking.some((entry) => entry.xp > 0);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.violet500} />}
      >
        <View style={{ gap: 4 }}>
          <Text style={styles.date}>
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </Text>
          <Text style={styles.hello}>{greeting(profile.name)}</Text>
          <Text style={styles.subtitle}>{heroMessage(data.completed, data.total)}</Text>
        </View>

        {continueGroup && next && (
          <Pressable style={styles.continue} onPress={() => openLesson(next)} accessibilityRole="button">
            <Text style={styles.continueTag}>{continueGroup.instrumentName} · {next.type}</Text>
            <Text style={styles.continueTitle}>{next.title}</Text>
            <View style={styles.barLight}>
              <View style={[styles.barFill, { width: `${Math.round((continueDone / continueGroup.lessons.length) * 100)}%` }]} />
            </View>
            <View style={styles.row}>
              <Text style={styles.continueMeta}>{continueDone} de {continueGroup.lessons.length} concluídas em {continueGroup.instrumentName}</Text>
              <Text style={styles.continueButton}>{continueDone ? "Continuar" : "Começar"} →</Text>
            </View>
          </Pressable>
        )}

        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.statValue}>🔥 {journey.streak}</Text><Text style={styles.statLabel}>dias seguidos</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{journey.xpMonth.toLocaleString("pt-BR")}</Text><Text style={styles.statLabel}>XP no mês</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>Nível {journey.level}</Text><Text style={styles.statLabel}>{data.completed}/{data.total} concluídos</Text></View>
        </View>

        <View style={{ gap: 12 }}>
          <SectionTitle>
            {featured ? (featured.isPrimary ? `Continue no ${featured.instrumentName}` : featured.instrumentName) : "Aulas e materiais"}
          </SectionTitle>
          {featured
            ? featured.lessons.slice(0, 4).map((lesson) => <LessonCard key={lesson.id} lesson={lesson} />)
            : <Text style={styles.subtitle}>Nenhum conteúdo publicado ainda.</Text>}
          <Button title="Ver todos os conteúdos" variant="secondary" onPress={() => router.push("/content")} />
        </View>

        {data.instruments.length > 0 && (
          <View style={{ gap: 12 }}>
            <SectionTitle>Explore por instrumento</SectionTitle>
            <View style={styles.grid}>
              {data.instruments.map((item) => (
                <Pressable
                  key={item.slug}
                  style={[styles.instrument, item.isPrimary && styles.instrumentPrimary]}
                  onPress={() => router.push({ pathname: "/content", params: { instrument: item.slug } })}
                  accessibilityRole="button"
                >
                  <Text style={styles.instrumentName}>{item.name}</Text>
                  <Text style={styles.instrumentMeta}>
                    {item.isPrimary ? "Seu instrumento principal" : item.count ? `${item.count} ${item.count === 1 ? "conteúdo" : "conteúdos"}` : "Em breve"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={{ gap: 12 }}>
          <SectionTitle>Sua jornada</SectionTitle>
          <View style={styles.journey}>
            <View style={styles.row}>
              <View>
                <Text style={styles.level}>Nível {journey.level}</Text>
                <Text style={styles.levelTitle}>{levelTitle(journey.level)}</Text>
              </View>
              <Text style={styles.journeyMeta}>{journey.xpTotal.toLocaleString("pt-BR")} XP no total</Text>
            </View>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${(journey.xpInLevel / XP_PER_LEVEL) * 100}%` }]} />
            </View>
            <Text style={styles.journeyMeta}>
              Faltam {XP_PER_LEVEL - journey.xpInLevel} XP para o nível {journey.level + 1}. Cada conteúdo concluído vale 20 XP.
            </Text>
            <Text style={[styles.journeyStrong, { marginTop: 10 }]}>Sequência da semana</Text>
            <View style={styles.week}>
              {journey.week.map((practiced, index) => (
                <View key={index} style={[styles.day, practiced && styles.dayDone, index === todayIndex && styles.dayToday]}>
                  <Text style={[styles.dayText, practiced && { color: colors.violet900 }]}>{WEEK_DAYS[index]}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.journeyMeta}>{streakNote}</Text>
          </View>
        </View>

        <Card>
          <Text style={styles.cardTitle}>Conquistas</Text>
          {journey.badges.length ? (
            <View style={styles.badges}>
              {journey.badges.map((badge) => (
                <View key={badge.slug} style={[styles.badge, !badge.unlocked && { opacity: 0.45 }]}>
                  <Text style={styles.badgeIcon}>{badge.unlocked ? BADGE_ICON[badge.slug] || "🎖️" : "🔒"}</Text>
                  <Text style={styles.badgeName}>{badge.name}</Text>
                  <Text style={styles.badgeDescription}>{badge.description}</Text>
                </View>
              ))}
            </View>
          ) : <Text style={styles.subtitle}>Nenhuma conquista disponível.</Text>}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Ranking da comunidade</Text>
          {someoneScored ? ranking.map((entry) => (
            <View key={`${entry.rank}-${entry.name}`} style={[styles.rankRow, entry.is_you && styles.rankYou]}>
              <Text style={styles.rank}>{entry.rank}</Text>
              <Text style={styles.rankName}>{entry.name}{entry.is_you ? " (você)" : ""}</Text>
              <Text style={styles.rankXp}>{entry.xp.toLocaleString("pt-BR")} XP</Text>
            </View>
          )) : <Text style={styles.subtitle}>Conclua aulas para aparecer no ranking.</Text>}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 22, paddingBottom: 40 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  date: { color: colors.violet500, fontWeight: "700", textTransform: "capitalize" },
  hello: { fontSize: 26, fontWeight: "800", color: colors.violet900 },
  subtitle: { color: colors.inkSoft, fontSize: 15 },
  continue: { backgroundColor: colors.violet700, borderRadius: radius.lg, padding: 18, gap: 8 },
  continueTag: { color: colors.violet300, fontWeight: "700", fontSize: 13 },
  continueTitle: { color: colors.white, fontWeight: "800", fontSize: 19 },
  continueMeta: { color: colors.violet300, fontSize: 13, flex: 1 },
  continueButton: { color: colors.yellow400, fontWeight: "800" },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: 12, gap: 2, borderWidth: 1, borderColor: colors.lavender100 },
  statValue: { color: colors.violet900, fontWeight: "800", fontSize: 16 },
  statLabel: { color: colors.inkSoft, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  instrument: { width: "48%", flexGrow: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 4, borderWidth: 1, borderColor: colors.lavender100 },
  instrumentPrimary: { borderColor: colors.violet500, backgroundColor: colors.lavender100 },
  instrumentName: { color: colors.ink, fontWeight: "800", fontSize: 15 },
  instrumentMeta: { color: colors.inkSoft, fontSize: 12 },
  journey: { backgroundColor: colors.violet800, borderRadius: radius.lg, padding: 20, gap: 8 },
  level: { color: colors.white, fontSize: 22, fontWeight: "800" },
  levelTitle: { color: colors.yellow400, fontWeight: "700" },
  journeyMeta: { color: colors.violet300, fontSize: 13 },
  journeyStrong: { color: colors.white, fontWeight: "700", fontSize: 15 },
  bar: { height: 10, borderRadius: 999, backgroundColor: colors.violet700, overflow: "hidden" },
  barLight: { height: 8, borderRadius: 999, backgroundColor: colors.violet800, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.yellow500, borderRadius: 999 },
  week: { flexDirection: "row", justifyContent: "space-between", marginVertical: 4 },
  day: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.violet700, alignItems: "center", justifyContent: "center" },
  dayDone: { backgroundColor: colors.yellow400 },
  dayToday: { borderWidth: 2, borderColor: colors.white },
  dayText: { color: colors.violet300, fontWeight: "700" },
  cardTitle: { fontSize: 17, fontWeight: "800", color: colors.ink },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badge: { width: "47%", flexGrow: 1, backgroundColor: colors.lavender050, borderRadius: radius.sm, padding: 10, gap: 2 },
  badgeIcon: { fontSize: 22 },
  badgeName: { color: colors.ink, fontWeight: "700" },
  badgeDescription: { color: colors.inkSoft, fontSize: 12 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 6, borderRadius: radius.sm },
  rankYou: { backgroundColor: colors.lavender100 },
  rank: { width: 22, color: colors.violet700, fontWeight: "800" },
  rankName: { flex: 1, color: colors.ink, fontWeight: "600" },
  rankXp: { color: colors.inkSoft, fontWeight: "700" },
});
