-- Comunidade social do The Instrumentalist. Aplicar após as migrations anteriores.
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 3000),
  music_url text check (music_url is null or music_url ~* '^https?://'),
  music_title text check (music_title is null or char_length(music_title) <= 160),
  created_at timestamptz not null default now(),
  constraint community_post_has_content check (char_length(trim(body)) > 0 or music_url is not null)
);
create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1200),
  created_at timestamptz not null default now()
);
create table if not exists public.community_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (post_id,user_id)
);
create table if not exists public.community_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (follower_id,following_id),
  constraint community_no_self_follow check (follower_id <> following_id)
);
create table if not exists public.community_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 3 and 80),
  description text not null default '' check (char_length(description) <= 500),
  created_at timestamptz not null default now()
);
create table if not exists public.community_group_members (
  group_id uuid not null references public.community_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(), primary key (group_id,user_id)
);
create table if not exists public.community_group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.community_groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create table if not exists public.community_announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 140),
  body text not null check (char_length(trim(body)) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index if not exists community_posts_created_idx on public.community_posts(created_at desc);
create index if not exists community_comments_post_idx on public.community_comments(post_id,created_at);
create index if not exists community_follows_following_idx on public.community_follows(following_id);
create index if not exists community_group_posts_group_idx on public.community_group_posts(group_id,created_at desc);

-- Perfis públicos apenas para usuários autenticados; profiles não armazena e-mail.
drop policy if exists "Users can view their profile" on public.profiles;
create policy "Authenticated users can view community profiles" on public.profiles for select to authenticated using (true);

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_follows enable row level security;
alter table public.community_groups enable row level security;
alter table public.community_group_members enable row level security;
alter table public.community_group_posts enable row level security;
alter table public.community_announcements enable row level security;

create policy "Authenticated can read community posts" on public.community_posts for select to authenticated using (true);
create policy "Users create own community posts" on public.community_posts for insert to authenticated with check (author_id = auth.uid());
create policy "Authors delete own community posts" on public.community_posts for delete to authenticated using (author_id = auth.uid());
create policy "Authenticated can read comments" on public.community_comments for select to authenticated using (true);
create policy "Users create own comments" on public.community_comments for insert to authenticated with check (author_id = auth.uid());
create policy "Authors delete own comments" on public.community_comments for delete to authenticated using (author_id = auth.uid());
create policy "Authenticated can read likes" on public.community_likes for select to authenticated using (true);
create policy "Users manage own likes" on public.community_likes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Authenticated can read follows" on public.community_follows for select to authenticated using (true);
create policy "Users manage own follows" on public.community_follows for all to authenticated using (follower_id = auth.uid()) with check (follower_id = auth.uid() and follower_id <> following_id);
create policy "Authenticated can read groups" on public.community_groups for select to authenticated using (true);
create policy "Users create groups" on public.community_groups for insert to authenticated with check (owner_id = auth.uid());
create policy "Owners update groups" on public.community_groups for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Owners delete groups" on public.community_groups for delete to authenticated using (owner_id = auth.uid());
create policy "Authenticated can read memberships" on public.community_group_members for select to authenticated using (true);
create policy "Users manage own membership" on public.community_group_members for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Authenticated can read group posts" on public.community_group_posts for select to authenticated using (true);
create policy "Members post in groups" on public.community_group_posts for insert to authenticated with check (author_id = auth.uid() and exists (select 1 from public.community_group_members m where m.group_id = community_group_posts.group_id and m.user_id = auth.uid()));
create policy "Authors delete own group posts" on public.community_group_posts for delete to authenticated using (author_id = auth.uid());
create policy "Authenticated can read announcements" on public.community_announcements for select to authenticated using (true);
create policy "Staff create announcements" on public.community_announcements for insert to authenticated with check (author_id = auth.uid() and public.is_admin_or_teacher());
