import { router, useFocusEffect } from "expo-router";
import { useCallback, useState, type ComponentProps } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { openProfile, PostCard } from "@/components/PostCard";
import { Avatar, Button, Card, ErrorState, Loading, Segmented } from "@/components/ui";
import {
  createAnnouncement, createComment, createGroup, createPost, fetchDashboard, formatDateTime, toggleFollow, toggleLike, toggleMembership,
  type Dashboard,
} from "@/lib/community";
import { friendlyError } from "@/lib/errors";
import { isStaff } from "@/lib/useMyProfile";
import { colors, radius } from "@/theme";

type Tab = "feed" | "groups" | "people" | "announcements";

function Input(props: ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={colors.inkSoft} {...props} style={[styles.input, props.multiline && { minHeight: 80, textAlignVertical: "top" }, props.style]} />;
}

export default function Community() {
  const [tab, setTab] = useState<Tab>("feed");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [post, setPost] = useState({ body: "", title: "", url: "" });
  const [group, setGroup] = useState({ name: "", description: "" });
  const [notice, setNotice] = useState({ title: "", body: "" });

  const load = useCallback(async () => {
    try {
      setData(await fetchDashboard());
      setError("");
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar a comunidade. Confira se a migração da Comunidade foi aplicada no Supabase."));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  /** Executa uma ação, mostra erro em alerta e recarrega. Devolve se deu certo. */
  async function run(action: () => Promise<unknown>, success?: string): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      await load();
      if (success) Alert.alert(success);
      return true;
    } catch (err) {
      Alert.alert("Ops", friendlyError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <ErrorState message={error} onRetry={load} /> : <Loading />;

  const profileOf = (id: string) => data.profiles.find((profile) => profile.id === id);
  const nameOf = (id: string) => profileOf(id)?.display_name || "Membro da comunidade";
  const me = profileOf(data.userId);
  const staff = isStaff(me?.role);
  const people = data.profiles.filter((profile) => profile.id !== data.userId);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.violet500}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Segmented
          value={tab}
          onChange={setTab}
          options={[{ value: "feed", label: "Feed" }, { value: "groups", label: "Grupos" }, { value: "people", label: "Pessoas" }, { value: "announcements", label: "Informes" }]}
        />

        {tab === "feed" && (
          <>
            <Card>
              <Text style={styles.cardTitle}>O que você está praticando?</Text>
              <Input value={post.body} onChangeText={(body) => setPost({ ...post, body })} placeholder="Conte para a comunidade…" multiline maxLength={3000} />
              <Text style={styles.counter}>{post.body.length} / 3000</Text>
              <Input value={post.title} onChangeText={(title) => setPost({ ...post, title })} placeholder="Nome da música (opcional)" maxLength={160} />
              <Input value={post.url} onChangeText={(url) => setPost({ ...post, url })} placeholder="Link de áudio/vídeo (opcional)"
                autoCapitalize="none" keyboardType="url" />
              <Button title="Publicar" loading={busy} onPress={async () => {
                if (await run(() => createPost(post.body, post.url, post.title), "Publicação compartilhada!")) setPost({ body: "", title: "", url: "" });
              }} />
            </Card>
            {data.posts.length ? data.posts.map((item) => (
              <PostCard
                key={item.id}
                post={item}
                author={profileOf(item.author_id)}
                nameOf={nameOf}
                comments={data.comments.filter((comment) => comment.post_id === item.id)}
                liked={data.likedPostIds.includes(item.id)}
                likeCount={data.likeCounts[item.id]}
                onLike={() => run(() => toggleLike(item.id, data.likedPostIds.includes(item.id)))}
                onComment={(body) => run(() => createComment(item.id, body))}
              />
            )) : <Text style={styles.empty}>Ainda não há publicações. Seja a primeira pessoa a compartilhar algo! ♫</Text>}
          </>
        )}

        {tab === "groups" && (
          <>
            <Card>
              <Text style={styles.cardTitle}>Criar grupo musical</Text>
              <Input value={group.name} onChangeText={(name) => setGroup({ ...group, name })} placeholder="Nome do novo grupo" maxLength={80} />
              <Input value={group.description} onChangeText={(description) => setGroup({ ...group, description })} placeholder="Descrição breve" maxLength={500} />
              <Button title="+ Criar grupo" loading={busy} onPress={async () => {
                if (await run(() => createGroup(group.name, group.description), "Grupo criado!")) setGroup({ name: "", description: "" });
              }} />
            </Card>
            {data.groups.length ? data.groups.map((item) => {
              const joined = data.joinedGroupIds.includes(item.id);
              return (
                <Card key={item.id}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.text}>{item.description || "Um espaço para conversar e praticar música."}</Text>
                  <Text style={styles.meta}>Por {nameOf(item.owner_id)}</Text>
                  <View style={styles.row}>
                    <Pressable
                      style={[styles.follow, joined && styles.following]}
                      onPress={() => run(() => toggleMembership(item.id, joined), joined ? "Você saiu do grupo." : "Você entrou no grupo.")}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.followText, joined && { color: colors.violet800 }]}>{joined ? "Sair do grupo" : "Participar +"}</Text>
                    </Pressable>
                    <Pressable onPress={() => router.push({ pathname: "/group/[id]", params: { id: item.id } })} accessibilityRole="button">
                      <Text style={styles.link}>Abrir conversas →</Text>
                    </Pressable>
                  </View>
                </Card>
              );
            }) : <Text style={styles.empty}>Ainda não há grupos. Crie o primeiro e reúna pessoas para praticar!</Text>}
          </>
        )}

        {tab === "people" && (
          people.length ? people.map((person) => {
            const following = data.followingIds.includes(person.id);
            const mutual = following && data.followerIds.includes(person.id);
            const label = mutual ? "Amigos · seguimento mútuo" : person.role === "admin" ? "Administrador" : person.role === "teacher" ? "Professor" : "Membro";
            return (
              <Card key={person.id} style={styles.personRow}>
                <Pressable style={styles.person} onPress={() => openProfile(person.id)} accessibilityRole="link">
                  <Avatar name={person.display_name || "Músico"} url={person.avatar_url} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName}>{person.display_name || "Músico"}</Text>
                    <Text style={styles.meta}>{label}</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[styles.follow, following && styles.following]}
                  onPress={() => run(() => toggleFollow(person.id, following))}
                  accessibilityRole="button"
                >
                  <Text style={[styles.followText, following && { color: colors.violet800 }]}>{following ? "Seguindo ✓" : "Seguir +"}</Text>
                </Pressable>
              </Card>
            );
          }) : <Text style={styles.empty}>Outros membros aparecerão aqui quando se cadastrarem.</Text>
        )}

        {tab === "announcements" && (
          <>
            {staff && (
              <Card>
                <Text style={styles.cardTitle}>Publicar informe oficial</Text>
                <Input value={notice.title} onChangeText={(title) => setNotice({ ...notice, title })} placeholder="Título do informe" maxLength={140} />
                <Input value={notice.body} onChangeText={(body) => setNotice({ ...notice, body })} placeholder="Mensagem oficial" multiline maxLength={3000} />
                <Button title="Publicar informe" loading={busy} onPress={async () => {
                  if (await run(() => createAnnouncement(notice.title, notice.body), "Informe oficial publicado.")) setNotice({ title: "", body: "" });
                }} />
              </Card>
            )}
            {data.announcements.length ? data.announcements.map((item) => (
              <Card key={item.id}>
                <Text style={styles.meta}>{formatDateTime(item.created_at)}</Text>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.text}>{item.body}</Text>
              </Card>
            )) : <Text style={styles.empty}>Os informes oficiais aparecerão aqui.</Text>}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.ink },
  text: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  meta: { color: colors.inkSoft, fontSize: 12 },
  counter: { color: colors.inkSoft, fontSize: 12, textAlign: "right", marginTop: -6 },
  empty: { color: colors.inkSoft, textAlign: "center", marginTop: 24 },
  input: {
    borderWidth: 1, borderColor: colors.violet300, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: colors.ink, backgroundColor: colors.lavender050,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  personRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  person: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  personName: { color: colors.ink, fontWeight: "700" },
  follow: { backgroundColor: colors.violet700, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.violet700 },
  following: { backgroundColor: colors.lavender100, borderColor: colors.violet300 },
  followText: { color: colors.white, fontWeight: "700", fontSize: 13 },
  link: { color: colors.violet700, fontWeight: "700" },
});
