import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { useAuth } from "./auth";
import { fetchProfile, type Profile } from "./content";

export type MyProfile = Profile & { id: string; email: string; xpTotal: number; level: number };

/** Perfil de quem está logado, relido do banco sempre que a tela ganha foco
 *  (o papel pode ter mudado no painel). */
export function useMyProfile(): { me: MyProfile | null; reload: () => Promise<void> } {
  const { session } = useAuth();
  const [me, setMe] = useState<MyProfile | null>(null);

  const reload = useCallback(async () => {
    if (!session) return;
    try {
      const profile = await fetchProfile(session.user.id, session.user.email || "");
      setMe({ ...profile, id: session.user.id, email: session.user.email || "" });
    } catch { /* mantém o último valor */ }
  }, [session]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  return { me, reload };
}

export function isStaff(role: string | undefined): boolean {
  return role === "admin" || role === "teacher";
}
