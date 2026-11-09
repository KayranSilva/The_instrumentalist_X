import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import type { ComponentProps } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Avatar, Loading } from "@/components/ui";
import { ROLE_LABEL, type Role } from "@/lib/admin";
import { supabase } from "@/lib/supabase";
import { isStaff, useMyProfile } from "@/lib/useMyProfile";
import { colors, radius } from "@/theme";

function Item({ icon, label, detail, onPress, danger }: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  detail?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const tint = danger ? colors.danger : colors.violet700;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.lavender100 }]}>
      <Ionicons name={icon} size={22} color={tint} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemLabel, danger && { color: colors.danger }]}>{label}</Text>
        {detail ? <Text style={styles.itemDetail}>{detail}</Text> : null}
      </View>
      {!danger && <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />}
    </Pressable>
  );
}

/** Configurações da conta: o mesmo menu do usuário que o site mostra na home. */
export default function Account() {
  const { me } = useMyProfile();
  if (!me) return <Loading />;

  const go = (href: Href) => router.push(href);
  const confirmLogout = () => Alert.alert("Sair da conta", "Deseja mesmo sair?", [
    { text: "Cancelar", style: "cancel" },
    { text: "Sair", style: "destructive", onPress: () => { supabase.auth.signOut(); } },
  ]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.identity}>
        <Avatar name={me.name} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>{me.name}</Text>
          <Text style={styles.email}>{me.email}</Text>
          <Text style={styles.role}>{ROLE_LABEL[me.role as Role] || "Aluno"} · Nível {me.level}</Text>
        </View>
      </View>

      <View style={styles.group}>
        <Item icon="person-circle-outline" label="Meu perfil" detail="Suas publicações e seguidores"
          onPress={() => go({ pathname: "/profile/[id]", params: { id: me.id } })} />
        <Item icon="musical-notes-outline" label="Trocar instrumento principal"
          detail={me.primaryInstrument ? `Atual: ${me.primaryInstrument.name}` : "Nenhum escolhido"} onPress={() => go("/instrument")} />
        {isStaff(me.role) && (
          <Item icon="construct-outline" label="Painel administrativo" detail="Publicar e editar conteúdos" onPress={() => go("/admin")} />
        )}
        {me.role === "admin" && (
          <Item icon="people-circle-outline" label="Gerenciar usuários" detail="Promover a professor ou admin" onPress={() => go("/admin/users")} />
        )}
      </View>

      <View style={styles.group}>
        <Item icon="log-out-outline" label="Sair da conta" onPress={confirmLogout} danger />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 18 },
  identity: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.white, borderRadius: radius.lg, padding: 18 },
  name: { fontSize: 20, fontWeight: "800", color: colors.violet900 },
  email: { color: colors.inkSoft },
  role: { color: colors.violet700, fontWeight: "700", fontSize: 13 },
  group: { backgroundColor: colors.white, borderRadius: radius.md, overflow: "hidden" },
  item: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.lavender100 },
  itemLabel: { color: colors.ink, fontWeight: "700", fontSize: 15 },
  itemDetail: { color: colors.inkSoft, fontSize: 13 },
});
