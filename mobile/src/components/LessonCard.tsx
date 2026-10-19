import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Lesson } from "@/lib/content";
import { colors, radius } from "@/theme";

/** Partituras/PDFs abrem o visualizador; o resto, o player. */
export function openLesson(lesson: Lesson): void {
  if (lesson.mediaKind === "pdf") router.push({ pathname: "/pdf/[id]", params: { id: lesson.id } });
  else router.push({ pathname: "/lesson/[id]", params: { id: lesson.id } });
}

export function LessonCard({ lesson }: { lesson: Lesson }) {
  const meta = [lesson.type, lesson.level, lesson.duration].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => openLesson(lesson)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{lesson.mediaKind === "pdf" ? "PDF" : lesson.mediaKind === "audio" ? "♪" : "▶"}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title} numberOfLines={2}>{lesson.title}</Text>
        <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        {lesson.teacher ? <Text style={styles.meta} numberOfLines={1}>com {lesson.teacher}</Text> : null}
      </View>
      {lesson.completed && <Text style={styles.done} accessibilityLabel="Concluída">✓</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.white,
    borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.lavender100,
  },
  badge: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.lavender100, alignItems: "center", justifyContent: "center" },
  badgeText: { color: colors.violet700, fontWeight: "800" },
  title: { color: colors.ink, fontWeight: "700", fontSize: 15 },
  meta: { color: colors.inkSoft, fontSize: 13 },
  done: { color: colors.success, fontSize: 20, fontWeight: "800" },
});
