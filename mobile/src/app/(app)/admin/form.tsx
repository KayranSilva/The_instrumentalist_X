import * as DocumentPicker from "expo-document-picker";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { Button, Chips, Field, Loading, Notice, Segmented } from "@/components/ui";
import {
  isStoredFile, LEVELS, listContent, listTeachers, MAX_UPLOAD_MB, saveContent, TYPE_LABEL,
  type AdminContent, type ContentForm, type ContentType, type Teacher,
} from "@/lib/admin";
import { fetchInstruments, type Instrument } from "@/lib/content";
import { friendlyError } from "@/lib/errors";
import { useMyProfile } from "@/lib/useMyProfile";
import { colors, radius } from "@/theme";

const PICKER_TYPES: Record<ContentType, string[]> = {
  aula: ["video/mp4", "video/webm", "video/quicktime", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg"],
  partitura: ["application/pdf"],
  musica: [],
};

const EMPTY: ContentForm = {
  type: "aula", title: "", instrument: "", level: "Iniciante", description: "", teacherId: "",
  duration: "", published: true, url: "", file: null,
};

/** Criar ou editar um conteúdo (mesmo formulário do painel do site). */
export default function ContentFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { me } = useMyProfile();
  const [form, setForm] = useState<ContentForm>(EMPTY);
  const [editing, setEditing] = useState<AdminContent | null>(null);
  const [source, setSource] = useState<"file" | "link">("file");
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [instrumentList, teacherList, contents] = await Promise.all([
          fetchInstruments(), listTeachers(), id ? listContent() : Promise.resolve([] as AdminContent[]),
        ]);
        setInstruments(instrumentList);
        setTeachers(teacherList);
        const item = id ? contents.find((content) => content.id === id) : undefined;
        if (id && !item) { setError("Conteúdo não encontrado."); setReady(true); return; }
        if (item) {
          setEditing(item);
          setSource(item.type === "musica" || !isStoredFile(item.url) ? "link" : "file");
          setForm({
            type: item.type, title: item.title, instrument: item.instrumentSlug, level: item.level, description: item.description,
            teacherId: item.teacherId, duration: item.duration, published: item.published,
            url: isStoredFile(item.url) ? "" : item.url, file: null,
          });
        }
      } catch (err) {
        setError(friendlyError(err, "Não foi possível carregar o formulário."));
      }
      setReady(true);
    })();
  }, [id]);

  // Professor responsável começa como a própria pessoa, como no site.
  useEffect(() => {
    if (!editing && me && !form.teacherId && teachers.some((teacher) => teacher.id === me.id)) {
      setForm((current) => ({ ...current, teacherId: me.id }));
    }
  }, [me, teachers, editing, form.teacherId]);

  const set = <K extends keyof ContentForm>(key: K, value: ContentForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const effectiveSource = form.type === "musica" ? "link" : source;

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: PICKER_TYPES[form.type], copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    set("file", { uri: asset.uri, name: asset.name, size: asset.size });
  }

  async function submit() {
    if (saving) return;
    setError("");
    setSaving(true);
    setProgress(effectiveSource === "file" && form.file ? 0 : null);
    try {
      const message = await saveContent(form, editing, effectiveSource, setProgress);
      router.back();
      Alert.alert(message);
    } catch (err) {
      setError(friendlyError(err, "Não foi possível salvar."));
    }
    setSaving(false);
    setProgress(null);
  }

  if (!ready) return <Loading />;

  const keepNote = editing ? " Deixe vazio para manter o arquivo atual." : "";
  const submitLabel = editing ? "Salvar alterações" : form.published ? "Publicar conteúdo" : "Salvar rascunho";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: editing ? "Editar item" : "Publicar item" }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.block}>
          <Text style={styles.label}>Tipo</Text>
          <Chips
            value={form.type}
            disabled={Boolean(editing)}
            onChange={(type) => setForm({ ...form, type, file: null })}
            options={(Object.keys(TYPE_LABEL) as ContentType[]).map((type) => ({ value: type, label: TYPE_LABEL[type] }))}
          />
        </View>

        <Field label="Título *" value={form.title} onChangeText={(value) => set("title", value)} placeholder="Ex.: Ritmo e levada de bossa nova" maxLength={140} />

        <View style={styles.block}>
          <Text style={styles.label}>Instrumento *</Text>
          <Chips value={form.instrument} onChange={(value) => set("instrument", value)}
            options={instruments.map((item) => ({ value: item.slug, label: item.name }))} />
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Nível</Text>
          <Chips value={form.level} onChange={(value) => set("level", value)} options={LEVELS.map((level) => ({ value: level, label: level }))} />
        </View>

        <Field label="Descrição" value={form.description} onChangeText={(value) => set("description", value)}
          placeholder="O que o aluno vai encontrar neste conteúdo?" multiline maxLength={2000}
          style={{ minHeight: 80, textAlignVertical: "top" }} />

        {form.type !== "musica" && (
          <Segmented value={source} onChange={setSource} options={[{ value: "file", label: "Enviar arquivo" }, { value: "link", label: "Usar link" }]} />
        )}

        {effectiveSource === "file" ? (
          <View style={styles.block}>
            <Text style={styles.label}>{form.type === "partitura" ? "Arquivo PDF da partitura" : "Vídeo ou áudio da aula"}{editing ? "" : " *"}</Text>
            <Button title={form.file ? "Trocar arquivo" : "Escolher arquivo"} variant="secondary" onPress={pickFile} />
            {form.file ? <Text style={styles.file}>📎 {form.file.name}{form.file.size ? ` · ${(form.file.size / 1024 / 1024).toFixed(1)} MB` : ""}</Text> : null}
            <Text style={styles.hint}>
              {form.type === "partitura" ? "Somente PDF." : "MP4, WEBM, MOV, MP3, WAV ou OGG."} Até {MAX_UPLOAD_MB} MB.{keepNote}
            </Text>
          </View>
        ) : (
          <Field
            label={form.type === "partitura" ? "Link do PDF *" : form.type === "aula" ? "Link do vídeo *" : "Link da música *"}
            value={form.url}
            onChangeText={(value) => set("url", value)}
            placeholder={form.type === "partitura" ? "https://…/partitura.pdf" : form.type === "aula" ? "https://www.youtube.com/watch?v=…" : "https://open.spotify.com/… ou https://youtube.com/…"}
            autoCapitalize="none"
            keyboardType="url"
          />
        )}

        <View style={styles.block}>
          <Text style={styles.label}>Professor responsável *</Text>
          <Chips value={form.teacherId} onChange={(value) => set("teacherId", value)}
            options={teachers.map((teacher) => ({ value: teacher.id, label: `${teacher.name}${teacher.id === me?.id ? " (você)" : ""}` }))} />
        </View>

        {form.type !== "partitura" && (
          <Field label="Duração" value={form.duration} onChangeText={(value) => set("duration", value)} placeholder="mm:ss" keyboardType="numbers-and-punctuation" />
        )}

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Publicar agora</Text>
            <Text style={styles.hint}>Desligado, fica como rascunho e não aparece para os alunos.</Text>
          </View>
          <Switch value={form.published} onValueChange={(value) => set("published", value)} trackColor={{ true: colors.violet500 }} />
        </View>

        {progress !== null && (
          <View style={styles.block}>
            <View style={styles.bar}><View style={[styles.barFill, { width: `${progress}%` }]} /></View>
            <Text style={styles.hint}>{progress < 100 ? `Enviando… ${progress}%` : "Processando…"}</Text>
          </View>
        )}
        {error ? <Notice kind="error">{error}</Notice> : null}
        <Button title={submitLabel} onPress={submit} loading={saving} />
        <Button title="Cancelar" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 18, paddingBottom: 48 },
  block: { gap: 8 },
  label: { color: colors.ink, fontWeight: "600", fontSize: 14 },
  hint: { color: colors.inkSoft, fontSize: 13 },
  file: { color: colors.violet800, fontWeight: "600" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.white, borderRadius: radius.md, padding: 14 },
  bar: { height: 8, borderRadius: 999, backgroundColor: colors.lavender100, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.violet500 },
});
