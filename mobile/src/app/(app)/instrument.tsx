import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";

import { Button, Chips, Loading, Notice } from "@/components/ui";
import { fetchInstruments, setPrimaryInstrument, type Instrument } from "@/lib/content";
import { friendlyError } from "@/lib/errors";
import { useMyProfile } from "@/lib/useMyProfile";
import { colors } from "@/theme";

export default function ChooseInstrument() {
  const { me } = useMyProfile();
  const [instruments, setInstruments] = useState<Instrument[] | null>(null);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchInstruments().then(setInstruments).catch((err) => setError(friendlyError(err)));
  }, []);
  useEffect(() => { if (me?.primaryInstrument && !selected) setSelected(me.primaryInstrument.slug); }, [me, selected]);

  async function save() {
    if (!me || !selected) { setError("Escolha um instrumento."); return; }
    setSaving(true);
    try {
      await setPrimaryInstrument(me.id, selected);
      router.back();
    } catch (err) {
      setError(friendlyError(err, "Não foi possível salvar."));
      setSaving(false);
    }
  }

  if (!instruments || !me) return error ? <Notice kind="error">{error}</Notice> : <Loading />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.text}>
        Seu instrumento principal aparece primeiro na home e nas aulas. Você continua com acesso a todos os outros.
      </Text>
      <Chips options={instruments.map((item) => ({ value: item.slug, label: item.name }))} value={selected} onChange={setSelected} />
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Button title="Salvar" onPress={save} loading={saving} />
      <Button title="Cancelar" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 18 },
  text: { color: colors.inkSoft, fontSize: 15, lineHeight: 21 },
});
