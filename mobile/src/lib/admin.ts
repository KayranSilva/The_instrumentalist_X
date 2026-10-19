// Painel administrativo direto no Supabase: mesmas regras de
// BackEnd/content.py e das funções admin_* do banco. O RLS garante que só
// professores/admins gravam conteúdo e só admins gerenciam usuários.
import { File, UploadType } from "expo-file-system";

import { formatDuration } from "./content";
import { SUPABASE_URL, supabase } from "./supabase";

export type ContentType = "aula" | "musica" | "partitura";
export type Role = "student" | "teacher" | "admin";

export const TYPE_LABEL: Record<ContentType, string> = { aula: "Aula", musica: "Música", partitura: "Partitura" };
export const ROLE_LABEL: Record<Role, string> = { student: "Aluno", teacher: "Professor", admin: "Administrador" };
export const LEVELS = ["Iniciante", "Intermediário", "Avançado"] as const;

const TYPE_TO_DB: Record<ContentType, string> = { aula: "lesson", musica: "song", partitura: "score" };
const TYPE_FROM_DB: Record<string, ContentType> = { lesson: "aula", song: "musica", score: "partitura" };
const LEVEL_TO_DB: Record<string, string> = { Iniciante: "beginner", Intermediário: "intermediate", Avançado: "advanced" };
const LEVEL_FROM_DB: Record<string, string> = { beginner: "Iniciante", intermediate: "Intermediário", advanced: "Avançado" };

const BUCKET = "lesson-assets";
export const STORAGE_MARKER = "/storage/v1/object/public/";
export const MAX_UPLOAD_MB = 50;

const VIDEO = [".mp4", ".webm", ".mov"];
const AUDIO = [".mp3", ".wav", ".ogg"];
const MIME: Record<string, string> = {
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".pdf": "application/pdf",
};

export type AdminContent = {
  id: string;
  type: ContentType;
  title: string;
  instrument: string;
  instrumentSlug: string;
  description: string;
  url: string;
  teacher: string;
  teacherId: string;
  duration: string;
  level: string;
  published: boolean;
};

export type Teacher = { id: string; name: string; role: string };

export type AdminUser = {
  id: string;
  display_name: string;
  email: string;
  role: Role;
  xp_total: number;
  primary_instrument: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

export type PickedFile = { uri: string; name: string; size?: number };

export type ContentForm = {
  type: ContentType;
  title: string;
  instrument: string;
  level: string;
  description: string;
  teacherId: string;
  duration: string;
  published: boolean;
  url: string;
  file: PickedFile | null;
};

function fail(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === "42501") throw new Error("Você não tem permissão para esta ação.");
  throw new Error(error.message);
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function durationToSeconds(value: string): number | null | undefined {
  const text = value.trim();
  if (!text) return null;
  const parts = text.split(":");
  if (parts.length > 3 || !parts.every((part) => /^\d+$/.test(part))) return undefined;
  const numbers = parts.map(Number);
  if (numbers.slice(1).some((number) => number >= 60)) return undefined;
  return numbers.reduce((total, number) => total * 60 + number, 0);
}

function validLink(url: string): boolean {
  return /^https?:\/\//.test(url) && url.length <= 2000;
}

export function isStoredFile(url: string): boolean {
  return url.includes(STORAGE_MARKER);
}

const CONTENT_SELECT = "id,type,title,description,level,duration_seconds,external_url,instructor_name,author_id,published,created_at,instruments(name,slug)";

type ContentRow = {
  id: string; type: string; title: string | null; description: string | null; level: string | null;
  duration_seconds: number | null; external_url: string | null; instructor_name: string | null;
  author_id: string | null; published: boolean; instruments: { name: string; slug: string } | null;
};

export async function listContent(): Promise<AdminContent[]> {
  const { data, error } = await supabase.from("content_items").select(CONTENT_SELECT).order("created_at", { ascending: false });
  fail(error);
  return ((data || []) as unknown as ContentRow[]).map((row) => ({
    id: row.id,
    type: TYPE_FROM_DB[row.type] || "aula",
    title: row.title || "",
    instrument: row.instruments?.name || "",
    instrumentSlug: row.instruments?.slug || "",
    description: row.description || "",
    url: row.external_url || "",
    teacher: row.instructor_name || "",
    teacherId: row.author_id || "",
    duration: formatDuration(row.duration_seconds),
    level: LEVEL_FROM_DB[row.level || ""] || "Iniciante",
    published: Boolean(row.published),
  }));
}

export async function listTeachers(): Promise<Teacher[]> {
  const { data, error } = await supabase.from("profiles").select("id,display_name,role").in("role", ["teacher", "admin"]).order("display_name");
  fail(error);
  return (data || []).map((row: { id: string; display_name: string | null; role: string }) => ({
    id: row.id, name: row.display_name || "Sem nome", role: row.role,
  }));
}

/** Validação local (igual ao site) antes de qualquer gravação. */
export function validateForm(form: ContentForm, editing: AdminContent | null, source: "file" | "link"): string | null {
  if (!form.title.trim() || form.title.trim().length > 140) return "Informe um título de até 140 caracteres.";
  if (form.description.trim().length > 2000) return "A descrição pode ter no máximo 2000 caracteres.";
  if (!form.instrument) return "Escolha o instrumento.";
  if (!form.teacherId) return "Escolha o professor responsável.";
  if (!LEVELS.includes(form.level as (typeof LEVELS)[number])) return "Escolha um nível válido.";
  if (form.type !== "partitura" && durationToSeconds(form.duration) === undefined) return "Duração inválida. Use o formato mm:ss (ex.: 12:40).";
  if (source === "link" && !validLink(form.url.trim())) return "Informe um link válido começando com https://";
  if (source === "file") {
    if (!form.file && !(editing && isStoredFile(editing.url))) return "Selecione o arquivo para enviar.";
    if (form.file) {
      const ext = extension(form.file.name);
      if (form.file.size === 0) return "O arquivo enviado está vazio.";
      if (form.file.size && form.file.size > MAX_UPLOAD_MB * 1024 * 1024) return `O arquivo excede o limite de ${MAX_UPLOAD_MB} MB.`;
      if (form.type === "aula" && ![...VIDEO, ...AUDIO].includes(ext)) {
        return "A aula deve ser um arquivo de vídeo (MP4, WEBM, MOV) ou áudio (MP3, WAV, OGG).";
      }
      if (form.type === "partitura" && ext !== ".pdf") return "A partitura deve estar em formato PDF.";
    }
  }
  return null;
}

async function buildRow(form: ContentForm): Promise<Record<string, unknown>> {
  const [{ data: instrument, error: instrumentError }, { data: teacher, error: teacherError }] = await Promise.all([
    supabase.from("instruments").select("id").eq("slug", form.instrument).maybeSingle(),
    supabase.from("profiles").select("id,display_name").eq("id", form.teacherId).in("role", ["teacher", "admin"]).maybeSingle(),
  ]);
  fail(instrumentError || teacherError);
  if (!instrument) throw new Error("Instrumento inválido.");
  if (!teacher) throw new Error("Professor inválido.");
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    instrument_id: instrument.id,
    author_id: teacher.id,
    instructor_name: teacher.display_name || null,
    level: LEVEL_TO_DB[form.level],
    duration_seconds: form.type === "partitura" ? null : durationToSeconds(form.duration) ?? null,
    published: form.published,
  };
}

/** Envia o arquivo ao Storage com progresso e registra em content_assets. Devolve a URL pública. */
async function uploadFile(contentId: string, file: PickedFile, onProgress?: (percent: number) => void): Promise<string> {
  const ext = extension(file.name);
  const objectPath = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 14)}${ext}`;
  const mimeType = MIME[ext] || "application/octet-stream";
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Faça login novamente.");

  const task = new File(file.uri).createUploadTask(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    httpMethod: "POST",
    uploadType: UploadType.BINARY_CONTENT,
    mimeType,
    headers: {
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
      Authorization: `Bearer ${token}`,
      "Content-Type": mimeType,
      "x-upsert": "false",
    },
    onProgress: ({ bytesSent, totalBytes }) => {
      if (onProgress && totalBytes > 0) onProgress(Math.round((bytesSent / totalBytes) * 100));
    },
  });
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    let message = "Não foi possível enviar o arquivo.";
    try { message = JSON.parse(result?.body || "{}").message || message; } catch { /* corpo não-JSON */ }
    throw new Error(/maximum allowed size|too large/i.test(message) ? "O arquivo é maior que o limite permitido." : message);
  }
  // Metadado informativo: se falhar, o arquivo já está no Storage.
  await supabase.from("content_assets").insert({
    content_item_id: contentId,
    storage_path: objectPath,
    asset_type: VIDEO.includes(ext) ? "video" : AUDIO.includes(ext) ? "audio" : ext === ".pdf" ? "pdf" : "image",
    mime_type: mimeType,
    file_size: file.size ?? null,
  });
  return `${SUPABASE_URL}${STORAGE_MARKER}${BUCKET}/${objectPath}`;
}

async function assetPaths(contentId: string): Promise<string[]> {
  const { data } = await supabase.from("content_assets").select("storage_path").eq("content_item_id", contentId);
  return (data || []).map((row: { storage_path: string }) => row.storage_path).filter(Boolean);
}

/** Apaga arquivos antigos do Storage (best effort, como no backend). */
async function removeAssets(contentId: string, keep?: string): Promise<void> {
  const paths = (await assetPaths(contentId)).filter((path) => path !== keep);
  if (!paths.length) return;
  await supabase.storage.from(BUCKET).remove(paths);
  await supabase.from("content_assets").delete().eq("content_item_id", contentId).in("storage_path", paths);
}

export async function saveContent(
  form: ContentForm, editing: AdminContent | null, source: "file" | "link", onProgress?: (percent: number) => void,
): Promise<string> {
  const problem = validateForm(form, editing, source);
  if (problem) throw new Error(problem);
  const row = await buildRow(form);
  const file = source === "file" ? form.file : null;
  const url = source === "link" ? form.url.trim() : "";

  if (!editing) {
    const { data, error } = await supabase.from("content_items")
      .insert({ ...row, type: TYPE_TO_DB[form.type], external_url: file ? null : url }).select("id").single();
    fail(error);
    const id = data!.id as string;
    if (file) {
      try {
        const publicUrl = await uploadFile(id, file, onProgress);
        const update = await supabase.from("content_items").update({ external_url: publicUrl }).eq("id", id);
        fail(update.error);
      } catch (error) {
        // Sem arquivo o conteúdo não serve para nada: desfaz a criação.
        await supabase.from("content_items").delete().eq("id", id);
        throw error;
      }
    }
    return form.published ? "Conteúdo publicado com sucesso." : "Rascunho salvo. Ele ainda não aparece para os alunos.";
  }

  if (url) row.external_url = url;
  if (file) row.external_url = await uploadFile(editing.id, file, onProgress);
  const { data, error } = await supabase.from("content_items").update(row).eq("id", editing.id).select("id");
  fail(error);
  if (!data?.length) throw new Error("Você não tem permissão para editar este conteúdo.");
  if (file || (url && url !== editing.url)) {
    const newUrl = String(row.external_url);
    await removeAssets(editing.id, file ? newUrl.slice(newUrl.lastIndexOf("/") + 1) : undefined);
  }
  return "Alterações salvas.";
}

export async function deleteContent(id: string): Promise<void> {
  const paths = await assetPaths(id);
  const { data, error } = await supabase.from("content_items").delete().eq("id", id).select("id");
  fail(error);
  if (!data?.length) throw new Error("Você não tem permissão para excluir este conteúdo.");
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

export async function listUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error?.code === "42501") throw new Error("Apenas administradores podem gerenciar usuários.");
  fail(error);
  return (data || []) as AdminUser[];
}

export async function setUserRole(userId: string, role: Role): Promise<void> {
  const { error } = await supabase.rpc("admin_set_user_role", { p_user_id: userId, p_role: role });
  if (error) throw new Error(error.message);
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
