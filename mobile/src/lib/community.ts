// Comunidade direto no Supabase: mesmas consultas e validações de
// BackEnd/community.py (o RLS é quem garante as permissões).
import { supabase } from "./supabase";

export type CommunityProfile = { id: string; display_name: string; avatar_url: string | null; role: string };
export type Post = { id: string; author_id: string; body: string; music_url: string | null; music_title: string | null; created_at: string };
export type Comment = { id: string; post_id: string; author_id: string; body: string; created_at: string };
export type Group = { id: string; name: string; description: string; created_at: string; owner_id: string };
export type GroupPost = { id: string; group_id: string; author_id: string; body: string; created_at: string };
export type Announcement = { id: string; title: string; body: string; created_at: string };

export type Dashboard = {
  userId: string;
  posts: Post[];
  comments: Comment[];
  likedPostIds: string[];
  likeCounts: Record<string, number>;
  followingIds: string[];
  followerIds: string[];
  profiles: CommunityProfile[];
  groups: Group[];
  joinedGroupIds: string[];
  groupPosts: GroupPost[];
  announcements: Announcement[];
};

const URL_PATTERN = /^https?:\/\//i;

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Sessão expirada. Faça login novamente.");
  return id;
}

export function roleName(role: string): string {
  return role === "admin" ? "Administrador" : role === "teacher" ? "Professor" : "Membro";
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export async function fetchDashboard(): Promise<Dashboard> {
  const userId = await uid();
  const [posts, comments, likes, follows, followers, profiles, groups, memberships, groupPosts, announcements] = await Promise.all([
    supabase.from("community_posts").select("id,author_id,body,music_url,music_title,created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("community_comments").select("id,post_id,author_id,body,created_at").order("created_at").limit(300),
    supabase
      .from("community_likes")
      .select("post_id,user_id")
      .limit(5000),
    supabase.from("community_follows").select("following_id").eq("follower_id", userId),
    supabase.from("community_follows").select("follower_id").eq("following_id", userId),
    supabase
      .from("community_profiles")
      .select("id,display_name,avatar_url,role")
      .order("display_name")
      .limit(100),
    supabase.from("community_groups").select("id,name,description,created_at,owner_id").order("created_at", { ascending: false }).limit(50),
    supabase.from("community_group_members").select("group_id").eq("user_id", userId),
    supabase.from("community_group_posts").select("id,group_id,author_id,body,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("community_announcements").select("id,title,body,created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  for (const result of [posts, comments, likes, follows, followers, profiles, groups, memberships, groupPosts, announcements]) {
    fail(result.error);
  }
  const likeRows = (likes.data || []) as Array<{ post_id: string; user_id: string }>;
  const likeCounts: Record<string, number> = {};
  for (const row of likeRows) likeCounts[row.post_id] = (likeCounts[row.post_id] || 0) + 1;
  return {
    userId,
    posts: (posts.data || []) as Post[],
    comments: (comments.data || []) as Comment[],
    likedPostIds: likeRows.filter((row) => row.user_id === userId).map((row) => row.post_id),
    likeCounts,
    followingIds: (follows.data || []).map((row: { following_id: string }) => row.following_id),
    followerIds: (followers.data || []).map((row: { follower_id: string }) => row.follower_id),
    profiles: (profiles.data || []) as CommunityProfile[],
    groups: (groups.data || []) as Group[],
    joinedGroupIds: (memberships.data || []).map((row: { group_id: string }) => row.group_id),
    groupPosts: (groupPosts.data || []) as GroupPost[],
    announcements: (announcements.data || []) as Announcement[],
  };
}

export type PublicProfile = {
  userId: string;
  profile: CommunityProfile;
  posts: Post[];
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
};

export async function fetchPublicProfile(profileId: string): Promise<PublicProfile | null> {
  const userId = await uid();
  const [profile, posts, followers, following] = await Promise.all([
    supabase
      .from("community_profiles")
      .select("id,display_name,avatar_url,role")
      .eq("id", profileId)
      .maybeSingle(),
    supabase.from("community_posts").select("id,author_id,body,music_url,music_title,created_at")
      .eq("author_id", profileId).order("created_at", { ascending: false }).limit(50),
    supabase.from("community_follows").select("follower_id").eq("following_id", profileId),
    supabase.from("community_follows").select("following_id").eq("follower_id", profileId),
  ]);
  for (const result of [profile, posts, followers, following]) fail(result.error);
  if (!profile.data) return null;
  const followerRows = (followers.data || []) as Array<{ follower_id: string }>;
  return {
    userId,
    profile: profile.data as CommunityProfile,
    posts: (posts.data || []) as Post[],
    followerCount: followerRows.length,
    followingCount: (following.data || []).length,
    isFollowing: followerRows.some((row) => row.follower_id === userId),
  };
}

export type GroupDetail = {
  group: Group;
  joined: boolean;
  posts: GroupPost[];
  profiles: CommunityProfile[];
};

export async function fetchGroup(groupId: string): Promise<GroupDetail | null> {
  const userId = await uid();

  const [group, membership] = await Promise.all([
    supabase
      .from("community_groups")
      .select("id,name,description,created_at,owner_id")
      .eq("id", groupId)
      .maybeSingle(),

    supabase
      .from("community_group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  fail(group.error);
  fail(membership.error);

  if (!group.data) return null;

  const joined = Boolean(membership.data);

  if (!joined) {
    const profiles = await supabase
      .from("community_profiles")
      .select("id,display_name,avatar_url,role")
      .eq("id", group.data.owner_id);

    fail(profiles.error);

    return {
      group: group.data as Group,
      joined: false,
      posts: [],
      profiles: (profiles.data || []) as CommunityProfile[],
    };
  }

  const posts = await supabase
    .from("community_group_posts")
    .select("id,group_id,author_id,body,created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(100);

  fail(posts.error);

  const typedPosts = (posts.data || []) as GroupPost[];

  const authorIds = [
    ...new Set([
      group.data.owner_id,
      ...typedPosts.map((post) => post.author_id),
    ]),
  ];

  const profiles = await supabase
    .from("community_profiles")
    .select("id,display_name,avatar_url,role")
    .in("id", authorIds);

  fail(profiles.error);

  return {
    group: group.data as Group,
    joined: true,
    posts: typedPosts,
    profiles: (profiles.data || []) as CommunityProfile[],
  };
}

export async function createPost(body: string, musicUrl: string, musicTitle: string): Promise<void> {
  const text = body.trim();
  const url = musicUrl.trim();
  const title = musicTitle.trim();
  if (!text && !url) throw new Error("Escreva uma publicação ou adicione um link musical.");
  if (text.length > 3000 || title.length > 160) throw new Error("O texto excede o limite permitido.");
  if (url && !URL_PATTERN.test(url)) throw new Error("O link musical deve começar com http:// ou https://.");
  const { error } = await supabase.from("community_posts")
    .insert({ author_id: await uid(), body: text, music_url: url || null, music_title: title || null });
  fail(error);
}

export async function createComment(postId: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text || text.length > 1200) throw new Error("Comentário inválido (máximo de 1.200 caracteres).");
  const { error } = await supabase.from("community_comments").insert({ post_id: postId, author_id: await uid(), body: text });
  fail(error);
}

/** Curte ou descurte. Devolve true se ficou curtido. */
export async function toggleLike(postId: string, liked: boolean): Promise<boolean> {
  const userId = await uid();
  if (liked) {
    const { error } = await supabase.from("community_likes").delete().eq("post_id", postId).eq("user_id", userId);
    fail(error);
    return false;
  }
  const { error } = await supabase.from("community_likes").upsert({ post_id: postId, user_id: userId }, { onConflict: "post_id,user_id" });
  fail(error);
  return true;
}

/** Segue ou deixa de seguir. Devolve true se passou a seguir. */
export async function toggleFollow(targetId: string, following: boolean): Promise<boolean> {
  const userId = await uid();
  if (targetId === userId) throw new Error("Você não pode seguir a si mesmo.");
  if (following) {
    const { error } = await supabase.from("community_follows").delete().eq("follower_id", userId).eq("following_id", targetId);
    fail(error);
    return false;
  }
  const { error } = await supabase.from("community_follows")
    .upsert({ follower_id: userId, following_id: targetId }, { onConflict: "follower_id,following_id" });
  fail(error);
  return true;
}

export async function createGroup(name: string, description: string): Promise<void> {
  const cleanName = name.trim();
  const cleanDescription = description.trim();
  if (cleanName.length < 3 || cleanName.length > 80 || cleanDescription.length > 500) {
    throw new Error("Informe um nome de grupo de 3 a 80 caracteres e uma descrição de até 500.");
  }
  const userId = await uid();
  const { data, error } = await supabase.from("community_groups")
    .insert({ name: cleanName, description: cleanDescription, owner_id: userId }).select("id").single();
  fail(error);
  if (!data) throw new Error("Erro ao criar grupo.");
}

/** Entra ou sai do grupo. Devolve true se entrou. */
export async function toggleMembership(groupId: string, joined: boolean): Promise<boolean> {
  const userId = await uid();
  if (joined) {
    const { error } = await supabase.from("community_group_members").delete().eq("group_id", groupId).eq("user_id", userId);
    fail(error);
    return false;
  }
  const { error } = await supabase.from("community_group_members")
    .upsert({ group_id: groupId, user_id: userId }, { onConflict: "group_id,user_id" });
  fail(error);
  return true;
}

export async function createGroupPost(groupId: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text || text.length > 2000) throw new Error("Mensagem inválida (máximo de 2.000 caracteres).");
  const { error } = await supabase.from("community_group_posts").insert({ group_id: groupId, author_id: await uid(), body: text });
  fail(error);
}

export async function createAnnouncement(title: string, body: string): Promise<void> {
  const cleanTitle = title.trim();
  const text = body.trim();
  if (!cleanTitle || cleanTitle.length > 140 || !text || text.length > 3000) throw new Error("Informe título e texto válidos.");
  const { error } = await supabase.from("community_announcements").insert({ author_id: await uid(), title: cleanTitle, body: text });
  if (error?.code === "42501") throw new Error("Apenas professores e administradores podem publicar informes.");
  fail(error);
}
