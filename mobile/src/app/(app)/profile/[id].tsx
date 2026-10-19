import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { PostCard } from "@/components/PostCard";
import { Avatar, ErrorState, Loading } from "@/components/ui";
import { fetchPublicProfile, roleName, toggleFollow, type PublicProfile } from "@/lib/community";
import { friendlyError } from "@/lib/errors";
import { colors, radius } from "@/theme";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<PublicProfile | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!UUID.test(id || "")) { setData(null); return; }
    try {
      setData(await fetchPublicProfile(id));
      setError("");
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar este perfil."));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (data === undefined) return <Loading />;
  if (data === null) return <ErrorState message="Este perfil não foi encontrado." onRetry={load} />;

  const { profile } = data;
  const name = profile.display_name || "Músico";
  const isOwn = profile.id === data.userId;

  async function follow() {
    if (!data) return;
    setBusy(true);
    try {
      await toggleFollow(profile.id, data.isFollowing);
      await load();
    } catch (err) {
      Alert.alert("Ops", friendlyError(err));
    }
    setBusy(false);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.violet500}
        onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Stack.Screen options={{ title: isOwn ? "Meu perfil" : name }} />
      <View style={styles.card}>
        <Avatar name={name} url={profile.avatar_url} size={84} />
        <Text style={styles.eyebrow}>PERFIL MUSICAL</Text>
        <Text style={styles.name}>{name}</Text>
        <View style={styles.pill}><Text style={styles.pillText}>{roleName(profile.role)}</Text></View>
        {isOwn ? (
          <Text style={styles.ownTag}>Este é o seu perfil</Text>
        ) : (
          <Pressable
            style={[styles.follow, data.isFollowing && styles.following, busy && { opacity: 0.6 }]}
            onPress={follow}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={[styles.followText, data.isFollowing && { color: colors.violet800 }]}>{data.isFollowing ? "Seguindo ✓" : "Seguir +"}</Text>
          </Pressable>
        )}
        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.statValue}>{data.posts.length}</Text><Text style={styles.statLabel}>publicações</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{data.followerCount}</Text><Text style={styles.statLabel}>seguidores</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{data.followingCount}</Text><Text style={styles.statLabel}>seguindo</Text></View>
        </View>
      </View>

      <Text style={styles.section}>{isOwn ? "Minhas publicações" : `Publicações de ${name}`}</Text>
      {data.posts.length
        ? data.posts.map((post) => <PostCard key={post.id} post={post} author={profile} />)
        : <Text style={styles.empty}>Ainda não há publicações por aqui. ♫</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 20, alignItems: "center", gap: 8 },
  eyebrow: { color: colors.violet500, fontWeight: "800", fontSize: 11, letterSpacing: 1, marginTop: 6 },
  name: { fontSize: 22, fontWeight: "800", color: colors.violet900, textAlign: "center" },
  pill: { backgroundColor: colors.lavender100, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  pillText: { color: colors.violet800, fontWeight: "700", fontSize: 12 },
  ownTag: { color: colors.inkSoft, fontWeight: "600" },
  follow: { backgroundColor: colors.violet700, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: colors.violet700 },
  following: { backgroundColor: colors.lavender100, borderColor: colors.violet300 },
  followText: { color: colors.white, fontWeight: "700" },
  stats: { flexDirection: "row", gap: 10, marginTop: 8, alignSelf: "stretch" },
  stat: { flex: 1, alignItems: "center", backgroundColor: colors.lavender050, borderRadius: radius.sm, paddingVertical: 10 },
  statValue: { fontSize: 18, fontWeight: "800", color: colors.violet900 },
  statLabel: { color: colors.inkSoft, fontSize: 12 },
  section: { fontSize: 17, fontWeight: "800", color: colors.ink, marginTop: 4 },
  empty: { color: colors.inkSoft, textAlign: "center", marginTop: 12 },
});
