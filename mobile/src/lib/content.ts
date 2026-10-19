// Consultas ao Supabase usadas pelas telas. Reproduz o que
// BackEnd/homepage.py monta para o site, direto do app (o RLS garante que
// cada pessoa só lê o que pode).
import { describeMedia, type MediaKind } from "./media";
import { supabase } from "./supabase";

export const XP_PER_LEVEL = 100;

const TYPE_LABELS: Record<string, string> = { lesson: "Aula", song: "Música", score: "Partitura" };
const LEVEL_LABELS: Record<string, string> = { beginner: "Iniciante", intermediate: "Intermediário", advanced: "Avançado" };

export type Instrument = { slug: string; name: string };

export type Lesson = {
  id: string;
  type: string;
  title: string;
  description: string;
  teacher: string;
  duration: string;
  level: string;
  instrumentName: string;
  instrumentSlug: string;
  mediaKind: MediaKind;
  mediaUrl: string;
  completed: boolean;
};

export type LessonGroup = {
  instrumentSlug: string;
  instrumentName: string;
  isPrimary: boolean;
  lessons: Lesson[];
};

export type Badge = { slug: string; name: string; description: string; unlocked: boolean };
export type RankingEntry = { rank: number; name: string; xp: number; is_you: boolean };

export type Journey = {
  level: number;
  xpTotal: number;
  xpInLevel: number;
  xpMonth: number;
  streak: number;
  week: boolean[];
  badges: Badge[];
  ranking: RankingEntry[];
};

export type Profile = {
  name: string;
  role: string;
  primaryInstrument: Instrument | null;
};

type ContentRow = {
  id: string;
  type: string;
  title: string | null;
  description: string | null;
  instructor_name: string | null;
  duration_seconds: number | null;
  level: string | null;
  external_url: string | null;
  instruments: { name: string; slug: string } | null;
};

const CONTENT_SELECT = "id,type,title,description,instructor_name,duration_seconds,level,external_url,instruments(name,slug)";

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

function toLesson(row: ContentRow, completed: Set<string>): Lesson {
  const media = describeMedia(row.external_url);
  return {
    id: row.id,
    type: TYPE_LABELS[row.type] || "Aula",
    title: row.title || "",
    description: row.description || "",
    teacher: row.instructor_name || "",
    duration: formatDuration(row.duration_seconds),
    level: LEVEL_LABELS[row.level || ""] || "Iniciante",
    instrumentName: row.instruments?.name || "Outros",
    instrumentSlug: row.instruments?.slug || "outros",
    mediaKind: media.kind,
    mediaUrl: media.url,
    completed: completed.has(row.id),
  };
}

async function completedIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from("content_completions").select("content_item_id");
  // Sem a migration de progresso a tabela não existe: segue sem marcar nada.
  if (error) return new Set();
  return new Set((data || []).map((row: { content_item_id: string }) => row.content_item_id));
}

export async function fetchInstruments(): Promise<Instrument[]> {
  const { data, error } = await supabase.from("instruments").select("slug,name").order("name");
  fail(error);
  return (data || []) as Instrument[];
}

export async function fetchProfile(userId: string, email: string): Promise<Profile & { xpTotal: number; level: number }> {
  const [profileResult, instrumentResult] = await Promise.all([
    supabase.from("profiles").select("display_name,role,xp_total,level").eq("id", userId).maybeSingle(),
    supabase.from("profile_instruments").select("instruments(slug,name)").eq("profile_id", userId).eq("is_primary", true).maybeSingle(),
  ]);
  fail(profileResult.error);
  const profile = profileResult.data;
  const primary = (instrumentResult.data?.instruments as unknown as Instrument | null) || null;
  return {
    name: profile?.display_name || (email ? email.split("@")[0] : "Aluno"),
    role: profile?.role || "student",
    primaryInstrument: primary,
    xpTotal: Number(profile?.xp_total || 0),
    level: Number(profile?.level || 1),
  };
}

export async function fetchJourney(xpTotal: number, level: number): Promise<Journey> {
  const xpInLevel = Math.max(0, Math.min(xpTotal - (level - 1) * XP_PER_LEVEL, XP_PER_LEVEL));
  const { data, error } = await supabase.rpc("get_my_journey");
  const journey = (error ? null : data) as {
    streak?: number; xp_month?: number; week?: boolean[]; badges?: Badge[]; ranking?: RankingEntry[];
  } | null;
  return {
    level,
    xpTotal,
    xpInLevel,
    xpMonth: Number(journey?.xp_month || 0),
    streak: Number(journey?.streak || 0),
    week: journey?.week?.length === 7 ? journey.week : Array(7).fill(false),
    badges: journey?.badges || [],
    ranking: journey?.ranking || [],
  };
}

/** Mesmos títulos de nível da home do site. */
export function levelTitle(level: number): string {
  if (level >= 10) return "Mestre do instrumento";
  if (level >= 6) return "Músico em evolução";
  if (level >= 3) return "Instrumentista dedicado";
  return "Iniciante";
}

/** Troca o instrumento principal (mesma lógica de /profile/instrument):
 *  desmarca os outros primeiro, por causa do índice "um principal por pessoa". */
export async function setPrimaryInstrument(userId: string, slug: string): Promise<void> {
  const { data: instrument, error } = await supabase.from("instruments").select("id").eq("slug", slug).maybeSingle();
  fail(error);
  if (!instrument) throw new Error("Instrumento inválido.");
  const unset = await supabase.from("profile_instruments").update({ is_primary: false })
    .eq("profile_id", userId).neq("instrument_id", instrument.id);
  fail(unset.error);
  const upsert = await supabase.from("profile_instruments")
    .upsert({ profile_id: userId, instrument_id: instrument.id, is_primary: true }, { onConflict: "profile_id,instrument_id" });
  fail(upsert.error);
}

/** Conteúdos publicados agrupados por instrumento, principal primeiro. */
export async function fetchLessonGroups(primarySlug?: string): Promise<LessonGroup[]> {
  const [{ data, error }, completed] = await Promise.all([
    supabase.from("content_items").select(CONTENT_SELECT).eq("published", true).order("created_at", { ascending: false }),
    completedIds(),
  ]);
  fail(error);

  const groups = new Map<string, LessonGroup>();
  for (const row of (data || []) as unknown as ContentRow[]) {
    const lesson = toLesson(row, completed);
    let group = groups.get(lesson.instrumentSlug);
    if (!group) {
      group = {
        instrumentSlug: lesson.instrumentSlug,
        instrumentName: lesson.instrumentName,
        isPrimary: Boolean(primarySlug) && lesson.instrumentSlug === primarySlug,
        lessons: [],
      };
      groups.set(lesson.instrumentSlug, group);
    }
    group.lessons.push(lesson);
  }
  return [...groups.values()].sort((a, b) =>
    Number(b.isPrimary) - Number(a.isPrimary) || a.instrumentName.localeCompare(b.instrumentName, "pt-BR"));
}

export async function fetchLesson(id: string): Promise<Lesson | null> {
  const [{ data, error }, completed] = await Promise.all([
    supabase.from("content_items").select(CONTENT_SELECT).eq("id", id).maybeSingle(),
    completedIds(),
  ]);
  fail(error);
  return data ? toLesson(data as unknown as ContentRow, completed) : null;
}

export type CompletionResult = {
  already_completed: boolean;
  xp_awarded: number;
  xp_total: number;
  level: number;
  new_badges: string[];
};

/** +20 XP na primeira vez, registra a prática e desbloqueia conquistas (função do banco). */
export async function completeContent(id: string): Promise<CompletionResult> {
  const { data, error } = await supabase.rpc("complete_content", { p_content_id: id });
  fail(error);
  return data as CompletionResult;
}
