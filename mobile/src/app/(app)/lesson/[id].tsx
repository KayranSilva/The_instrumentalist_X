import * as Linking from "expo-linking";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

import { AudioPlayer, EmbedPlayer, VideoPlayer } from "@/components/players";
import { Button, ErrorState, Loading, Notice } from "@/components/ui";
import { completeContent, fetchLesson, type Lesson } from "@/lib/content";
import { friendlyError } from "@/lib/errors";
import { colors, radius } from "@/theme";

function Media({ lesson }: { lesson: Lesson }) {
  switch (lesson.mediaKind) {
    case "video": return <VideoPlayer url={lesson.mediaUrl} />;
    case "audio": return <AudioPlayer url={lesson.mediaUrl} />;
    case "youtube":
    case "vimeo": return <EmbedPlayer url={lesson.mediaUrl} />;
    case "image": return <Image source={{ uri: lesson.mediaUrl }} style={styles.image} resizeMode="contain" />;
    case "pdf":
      return <Button title="Abrir partitura" onPress={() => router.replace({ pathname: "/pdf/[id]", params: { id: lesson.id } })} />;
    case "link":
      return <Button title="Abrir conteúdo no navegador" variant="secondary" onPress={() => Linking.openURL(lesson.mediaUrl)} />;
    default:
      return <Notice kind="info">Este conteúdo ainda não tem mídia.</Notice>;
  }
}

export default function LessonPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lesson, setLesson] = useState<Lesson | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [completing, setCompleting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setLesson(await fetchLesson(id));
      setError("");
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar a aula."));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function complete() {
    if (!lesson) return;
    setCompleting(true);
    try {
      const result = await completeContent(lesson.id);
      setLesson({ ...lesson, completed: true });
      const badges = result.new_badges?.length ? ` Conquista desbloqueada: ${result.new_badges.join(", ")}.` : "";
      setFeedback({
        kind: "success",
        text: result.already_completed
          ? "Você já tinha concluído este conteúdo."
          : `+${result.xp_awarded} XP! Agora você está no nível ${result.level}.${badges}`,
      });
    } catch (err) {
      setFeedback({ kind: "error", text: friendlyError(err, "Não foi possível marcar como concluída.") });
    }
    setCompleting(false);
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (lesson === undefined) return <Loading />;
  if (lesson === null) return <ErrorState message="Conteúdo não encontrado." onRetry={() => router.back()} />;

  const meta = [lesson.type, lesson.instrumentName, lesson.level, lesson.duration].filter(Boolean).join(" · ");

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: lesson.type }} />
      <Media lesson={lesson} />
      <View style={{ gap: 6 }}>
        <Text style={styles.title}>{lesson.title}</Text>
        <Text style={styles.meta}>{meta}</Text>
        {lesson.teacher ? <Text style={styles.meta}>Professor(a): {lesson.teacher}</Text> : null}
      </View>
      {lesson.description ? <Text style={styles.description}>{lesson.description}</Text> : null}
      {feedback && <Notice kind={feedback.kind}>{feedback.text}</Notice>}
      {lesson.completed
        ? <View style={styles.done}><Text style={styles.doneText}>✓ Concluída</Text></View>
        : <Button title="Marcar como concluída" onPress={complete} loading={completing} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 40 },
  image: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.white },
  title: { fontSize: 22, fontWeight: "800", color: colors.ink },
  meta: { color: colors.inkSoft, fontSize: 14 },
  description: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  done: { borderRadius: radius.md, paddingVertical: 14, alignItems: "center", backgroundColor: colors.lavender100 },
  doneText: { color: colors.success, fontWeight: "800", fontSize: 16 },
});
