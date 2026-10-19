import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { openProfile } from "@/components/PostCard";
import { Button, Card, ErrorState, Loading } from "@/components/ui";
import { createGroupPost, fetchGroup, formatDateTime, toggleMembership, type GroupDetail } from "@/lib/community";
import { friendlyError } from "@/lib/errors";
import { colors, radius } from "@/theme";

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<GroupDetail | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchGroup(id));
      setError("");
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar o grupo."));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      Alert.alert("Ops", friendlyError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (data === undefined) return <Loading />;
  if (data === null) return <ErrorState message="Grupo não encontrado." onRetry={load} />;

  const nameOf = (authorId: string) => data.profiles.find((profile) => profile.id === authorId)?.display_name || "Membro da comunidade";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: data.group.name }} />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.violet500}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Card>
          <Text style={styles.title}>{data.group.name}</Text>
          <Text style={styles.text}>{data.group.description || "Um espaço para conversar e praticar música."}</Text>
          <Text style={styles.meta}>Criado por {nameOf(data.group.owner_id)}</Text>
          <Button
            title={data.joined ? "Sair do grupo" : "Participar do grupo +"}
            variant={data.joined ? "secondary" : "primary"}
            loading={busy}
            onPress={() => run(() => toggleMembership(data.group.id, data.joined))}
          />
        </Card>

        {data.joined ? (
          <Card>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Compartilhe algo com o grupo"
              placeholderTextColor={colors.inkSoft}
              maxLength={2000}
              multiline
              style={styles.input}
            />
            <Button title="Enviar" loading={busy} onPress={async () => {
              if (await run(() => createGroupPost(data.group.id, message))) setMessage("");
            }} />
          </Card>
        ) : <Text style={styles.meta}>Participe do grupo para enviar mensagens.</Text>}

        {data.posts.length ? data.posts.map((post) => (
          <Card key={post.id}>
            <Text style={styles.author} onPress={() => openProfile(post.author_id)}>{nameOf(post.author_id)}</Text>
            <Text style={styles.text}>{post.body}</Text>
            <Text style={styles.meta}>{formatDateTime(post.created_at)}</Text>
          </Card>
        )) : <View><Text style={styles.empty}>Nenhuma conversa ainda.</Text></View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  text: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  meta: { color: colors.inkSoft, fontSize: 12 },
  author: { color: colors.violet800, fontWeight: "800" },
  empty: { color: colors.inkSoft, textAlign: "center", marginTop: 16 },
  input: {
    borderWidth: 1, borderColor: colors.violet300, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10,
    minHeight: 70, textAlignVertical: "top", fontSize: 15, color: colors.ink, backgroundColor: colors.lavender050,
  },
});
