import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Avatar, RolePill } from "@/components/ui";
import { formatDateTime, type Comment, type CommunityProfile, type Post } from "@/lib/community";
import { colors, radius } from "@/theme";

export function openProfile(id: string): void {
  router.push({ pathname: "/profile/[id]", params: { id } });
}

/** Publicação da comunidade. Curtir/comentar só aparecem quando os handlers vêm. */
export function PostCard({ post, author, nameOf, comments, liked, likeCount, onLike, onComment }: {
  post: Post;
  author: CommunityProfile | undefined;
  nameOf?: (id: string) => string;
  comments?: Comment[];
  liked?: boolean;
  likeCount?: number;
  onLike?: () => void;
  onComment?: (body: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const name = author?.display_name || "Membro da comunidade";

  async function send() {
    if (!onComment || !draft.trim() || sending) return;
    setSending(true);
    if (await onComment(draft)) setDraft("");
    setSending(false);
  }

  return (
    <View style={styles.card}>
      <Pressable style={styles.head} onPress={() => openProfile(post.author_id)} accessibilityRole="link">
        <Avatar name={name} url={author?.avatar_url} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.meta}>{formatDateTime(post.created_at)}</Text>
        </View>
        <RolePill role={author?.role || ""} />
      </Pressable>

      {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
      {post.music_url ? (
        <Pressable style={styles.music} onPress={() => Linking.openURL(post.music_url!)} accessibilityRole="link">
          <Text style={styles.play}>▶</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.musicTitle} numberOfLines={1}>{post.music_title || "Ouvir música compartilhada"}</Text>
            <Text style={styles.meta}>Abrir link musical ↗</Text>
          </View>
        </Pressable>
      ) : null}

      {onLike && (
        <View style={styles.actions}>
          <Pressable onPress={onLike} accessibilityRole="button" hitSlop={6}>
            <Text style={[styles.action, liked && { color: colors.danger }]}>{liked ? "♥ Curtido" : "♡ Curtir"}{likeCount ? ` · ${likeCount}` : ""}</Text>
          </Pressable>
          <Text style={styles.action}>💬 {comments?.length || 0}</Text>
        </View>
      )}

      {comments && comments.length > 0 && (
        <View style={styles.comments}>
          {comments.map((comment) => (
            <Text key={comment.id} style={styles.comment}>
              <Text style={styles.commentAuthor} onPress={() => openProfile(comment.author_id)}>{nameOf?.(comment.author_id) || "Membro"}: </Text>
              {comment.body}
            </Text>
          ))}
        </View>
      )}

      {onComment && (
        <View style={styles.commentRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Escreva um comentário…"
            placeholderTextColor={colors.inkSoft}
            maxLength={1200}
            style={styles.commentInput}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable onPress={send} disabled={sending || !draft.trim()} accessibilityRole="button" style={[styles.send, (!draft.trim() || sending) && { opacity: 0.5 }]}>
            <Text style={styles.sendText}>Enviar</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.lavender100 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { color: colors.ink, fontWeight: "700", fontSize: 15 },
  meta: { color: colors.inkSoft, fontSize: 12 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  music: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.lavender100, borderRadius: radius.sm, padding: 10 },
  play: { color: colors.violet700, fontSize: 18 },
  musicTitle: { color: colors.violet800, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 18 },
  action: { color: colors.inkSoft, fontWeight: "700" },
  comments: { gap: 6, borderTopWidth: 1, borderTopColor: colors.lavender100, paddingTop: 8 },
  comment: { color: colors.ink, fontSize: 14 },
  commentAuthor: { fontWeight: "700", color: colors.violet800 },
  commentRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  commentInput: {
    flex: 1, borderWidth: 1, borderColor: colors.violet300, borderRadius: radius.sm, paddingHorizontal: 12,
    paddingVertical: 8, color: colors.ink, backgroundColor: colors.lavender050,
  },
  send: { backgroundColor: colors.violet700, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 9 },
  sendText: { color: colors.white, fontWeight: "700" },
});
