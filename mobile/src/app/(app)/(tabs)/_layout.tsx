import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";

import { colors } from "@/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

function icon(name: IconName, active: IconName) {
  return ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? active : name} color={String(color)} size={size} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.violet700,
        tabBarInactiveTintColor: colors.inkSoft,
        headerTintColor: colors.violet700,
        headerTitleStyle: { color: colors.ink, fontWeight: "700" },
        sceneStyle: { backgroundColor: colors.lavender050 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Início", headerShown: false, tabBarIcon: icon("home-outline", "home") }} />
      <Tabs.Screen name="content" options={{ title: "Aulas", tabBarIcon: icon("play-circle-outline", "play-circle") }} />
      <Tabs.Screen name="community" options={{ title: "Comunidade", tabBarIcon: icon("people-outline", "people") }} />
      <Tabs.Screen name="account" options={{ title: "Conta", tabBarIcon: icon("settings-outline", "settings") }} />
    </Tabs>
  );
}
