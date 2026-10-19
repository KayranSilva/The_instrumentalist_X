import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Avatar, Chips, ErrorState, Loading } from "@/components/ui";
import { formatDate, listUsers, ROLE_LABEL, setUserRole, type AdminUser, type Role } from "@/lib/admin";
import { friendlyError } from "@/lib/errors";
import { useMyProfile } from "@/lib/useMyProfile";
import { colors, radius } from "@/theme";

const ROLES = Object.keys(ROLE_LABEL) as Role[];

export default function AdminUsers() {
  const { me } = useMyProfile();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await listUsers());
      setError("");
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar os usuários."));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (users || []).filter((user) => !text || `${user.display_name} ${user.email}`.toLowerCase().includes(text));
  }, [users, query]);

  if (me && me.role !== "admin") return <ErrorState message="Apenas administradores podem gerenciar usuários." onRetry={() => router.back()} />;
  if (!users) return error ? <ErrorState message={error} onRetry={load} /> : <Loading />;

  function changeRole(user: AdminUser, role: Role) {
    if (role === user.role) return;
    const name = user.display_name || user.email;
    const warning = role === "admin"
      ? `Tornar ${name} administrador? Essa pessoa terá acesso total, inclusive para gerenciar usuários.`
      : `Alterar o papel de ${name} para ${ROLE_LABEL[role]}?`;
    Alert.alert("Alterar papel", warning, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Confirmar", onPress: async () => {
          setSavingId(user.id);
          try {
            await setUserRole(user.id, role);
            setUsers((list) => (list || []).map((item) => (item.id === user.id ? { ...item, role } : item)));
            Alert.alert(`${name} agora é ${ROLE_LABEL[role].toLowerCase()}.`);
          } catch (err) {
            Alert.alert("Ops", friendlyError(err, "Não foi possível alterar o papel."));
          }
          setSavingId("");
        },
      },
    ]);
  }

  const count = (role: Role) => users.filter((user) => user.role === role).length;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.violet500}
        onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statValue}>{count("student")}</Text><Text style={styles.statLabel}>alunos</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{count("teacher")}</Text><Text style={styles.statLabel}>professores</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{count("admin")}</Text><Text style={styles.statLabel}>admins</Text></View>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar por nome ou e-mail…"
        placeholderTextColor={colors.inkSoft}
        autoCapitalize="none"
        style={styles.search}
      />
      <Text style={styles.count}>{visible.length} {visible.length === 1 ? "usuário" : "usuários"}</Text>

      {visible.length ? visible.map((user) => {
        const isMe = user.id === me?.id;
        return (
          <View key={user.id} style={[styles.user, savingId === user.id && { opacity: 0.6 }]}>
            <View style={styles.userHead}>
              <Avatar name={user.display_name || user.email} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{user.display_name || "Sem nome"}{isMe ? " (você)" : ""}</Text>
                <Text style={styles.meta}>{user.email}</Text>
              </View>
            </View>
            <Text style={styles.meta}>
              {user.primary_instrument || "—"} · {Number(user.xp_total || 0).toLocaleString("pt-BR")} XP · cadastro {formatDate(user.created_at)} · último acesso {formatDate(user.last_sign_in_at)}
            </Text>
            <Chips
              value={user.role}
              disabled={isMe || savingId === user.id}
              onChange={(role) => changeRole(user, role)}
              options={ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }))}
            />
            {isMe && <Text style={styles.meta}>Você não pode alterar o seu próprio papel.</Text>}
          </View>
        );
      }) : <Text style={styles.empty}>{users.length ? "Nenhum usuário encontrado." : "Nenhum usuário cadastrado."}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.lavender100 },
  statValue: { fontSize: 22, fontWeight: "800", color: colors.violet900 },
  statLabel: { color: colors.inkSoft, fontSize: 12 },
  search: {
    borderWidth: 1, borderColor: colors.violet300, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: colors.ink, backgroundColor: colors.white,
  },
  count: { color: colors.inkSoft, fontSize: 13 },
  user: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.lavender100 },
  userHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { color: colors.ink, fontWeight: "700", fontSize: 15 },
  meta: { color: colors.inkSoft, fontSize: 13 },
  empty: { color: colors.inkSoft, textAlign: "center", marginTop: 16 },
});
