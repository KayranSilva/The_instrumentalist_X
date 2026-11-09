import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { Loading } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth";

function RootStack() {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;

  // Sem sessão só existem as telas de login/cadastro, e vice-versa: ao
  // entrar ou sair, o Router leva automaticamente para o grupo certo.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootStack />
    </AuthProvider>
  );
}
