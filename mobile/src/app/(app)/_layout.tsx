import { Stack } from "expo-router";

import { colors } from "@/theme";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.violet700,
        headerTitleStyle: { color: colors.ink, fontWeight: "700" },
        headerStyle: { backgroundColor: colors.white },
        contentStyle: { backgroundColor: colors.lavender050 },
        headerBackTitle: "Voltar",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="lesson/[id]" options={{ title: "Aula" }} />
      <Stack.Screen name="pdf/[id]" options={{ title: "Partitura" }} />
      <Stack.Screen name="profile/[id]" options={{ title: "Perfil" }} />
      <Stack.Screen name="group/[id]" options={{ title: "Grupo" }} />
      <Stack.Screen name="instrument" options={{ title: "Instrumento principal", presentation: "modal" }} />
      <Stack.Screen name="admin/index" options={{ title: "Painel administrativo" }} />
      <Stack.Screen name="admin/form" options={{ title: "Conteúdo" }} />
      <Stack.Screen name="admin/users" options={{ title: "Usuários" }} />
    </Stack>
  );
}
