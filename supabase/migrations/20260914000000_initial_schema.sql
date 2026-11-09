create extension if not exists pgcrypto;

create type public.profile_role as enum ('student', 'teacher', 'admin');
create type public.content_type as enum ('lesson', 'song', 'score');
create type public.asset_type as enum ('video', 'audio', 'pdf', 'image', 'external');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  role public.profile_role not null default 'student',
  xp_total integer not null default 0 check (xp_total >= 0),
  level integer not null default 1 check (level >= 1),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  icon text,
  description text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.profile_instruments (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  skill_level text not null default 'beginner',
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (profile_id, instrument_id)
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  type public.content_type not null,
  title text not null,
  description text not null default '',
  instrument_id uuid references public.instruments(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  level text not null default 'beginner',
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  external_url text,
  published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint content_items_external_url_check check (
    external_url is null or external_url ~* '^https?://'
  )
);

create table public.content_assets (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  storage_path text not null unique,
  asset_type public.asset_type not null,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  instrument_id uuid references public.instruments(id) on delete set null,
  level text not null default 'beginner',
  published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  position integer not null check (position > 0),
  unique (course_id, position)
);

create table public.module_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.course_modules(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete restrict,
  position integer not null check (position > 0),
  unique (module_id, position),
  unique (module_id, content_item_id)
);

create table public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.module_lessons(id) on delete cascade,
  progress_percent numeric(5, 2) not null default 0 check (progress_percent between 0 and 100),
  last_position_seconds integer not null default 0 check (last_position_seconds >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, lesson_id)
);

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  instrument_id uuid references public.instruments(id) on delete set null,
  lesson_id uuid references public.module_lessons(id) on delete set null,
  practiced_at timestamptz not null default timezone('utc', now()),
  duration_seconds integer not null check (duration_seconds > 0),
  xp_earned integer not null default 0 check (xp_earned >= 0)
);

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.profile_badges (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  unlocked_at timestamptz not null default timezone('utc', now()),
  primary key (profile_id, badge_id)
);

create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount > 0),
  source text not null,
  reference_id uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create index content_items_instrument_id_idx on public.content_items (instrument_id);
create index content_items_author_id_idx on public.content_items (author_id);
create index content_items_published_idx on public.content_items (published, created_at desc);
create index content_assets_content_item_id_idx on public.content_assets (content_item_id);
create index courses_instrument_id_idx on public.courses (instrument_id);
create index course_modules_course_id_idx on public.course_modules (course_id, position);
create index module_lessons_module_id_idx on public.module_lessons (module_id, position);
create index practice_sessions_user_id_idx on public.practice_sessions (user_id, practiced_at desc);
create index xp_events_user_id_idx on public.xp_events (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger content_items_set_updated_at
before update on public.content_items
for each row execute function public.set_updated_at();

create trigger courses_set_updated_at
before update on public.courses
for each row execute function public.set_updated_at();

create trigger lesson_progress_set_updated_at
before update on public.lesson_progress
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin_or_teacher()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role in ('admin', 'teacher')
  );
$$;

create or replace view public.leaderboard as
select
  p.id,
  p.display_name,
  p.avatar_url,
  p.xp_total,
  p.level,
  dense_rank() over (order by p.xp_total desc, p.created_at asc) as rank
from public.profiles p;

alter table public.profiles enable row level security;
alter table public.instruments enable row level security;
alter table public.profile_instruments enable row level security;
alter table public.content_items enable row level security;
alter table public.content_assets enable row level security;
alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.module_lessons enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.badges enable row level security;
alter table public.profile_badges enable row level security;
alter table public.xp_events enable row level security;

create policy "Users can view their profile"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin_or_teacher());

create policy "Users can update their profile"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Authenticated users can view instruments"
on public.instruments for select to authenticated
using (true);

create policy "Users manage their instruments"
on public.profile_instruments for all to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "Users view published content"
on public.content_items for select to authenticated
using (published or author_id = auth.uid() or public.is_admin_or_teacher());

create policy "Teachers manage content"
on public.content_items for all to authenticated
using (public.is_admin_or_teacher())
with check (public.is_admin_or_teacher());

create policy "Users view assets for visible content"
on public.content_assets for select to authenticated
using (exists (
  select 1 from public.content_items c
  where c.id = content_item_id
    and (c.published or c.author_id = auth.uid() or public.is_admin_or_teacher())
));

create policy "Teachers manage content assets"
on public.content_assets for all to authenticated
using (public.is_admin_or_teacher())
with check (public.is_admin_or_teacher());

create policy "Users view published courses"
on public.courses for select to authenticated
using (published or public.is_admin_or_teacher());

create policy "Teachers manage courses"
on public.courses for all to authenticated
using (public.is_admin_or_teacher())
with check (public.is_admin_or_teacher());

create policy "Users view modules of visible courses"
on public.course_modules for select to authenticated
using (exists (
  select 1 from public.courses c
  where c.id = course_id and (c.published or public.is_admin_or_teacher())
));

create policy "Teachers manage course modules"
on public.course_modules for all to authenticated
using (public.is_admin_or_teacher())
with check (public.is_admin_or_teacher());

create policy "Users view lessons of visible courses"
on public.module_lessons for select to authenticated
using (exists (
  select 1
  from public.course_modules m
  join public.courses c on c.id = m.course_id
  where m.id = module_id and (c.published or public.is_admin_or_teacher())
));

create policy "Teachers manage module lessons"
on public.module_lessons for all to authenticated
using (public.is_admin_or_teacher())
with check (public.is_admin_or_teacher());

create policy "Users manage their lesson progress"
on public.lesson_progress for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users manage their practice sessions"
on public.practice_sessions for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Authenticated users can view badges"
on public.badges for select to authenticated
using (true);

create policy "Users view their badges"
on public.profile_badges for select to authenticated
using (profile_id = auth.uid() or public.is_admin_or_teacher());

create policy "Teachers manage awarded badges"
on public.profile_badges for all to authenticated
using (public.is_admin_or_teacher())
with check (public.is_admin_or_teacher());

create policy "Users view their XP events"
on public.xp_events for select to authenticated
using (user_id = auth.uid() or public.is_admin_or_teacher());

create policy "Teachers create XP events"
on public.xp_events for insert to authenticated
with check (public.is_admin_or_teacher());

insert into public.instruments (name, slug, icon)
values
  ('Violão', 'violao', 'violao'),
  ('Piano', 'piano', 'piano'),
  ('Bateria', 'bateria', 'bateria'),
  ('Canto', 'canto', 'canto'),
  ('Violino', 'violino', 'violino'),
  ('Ukulele', 'ukulele', 'ukulele')
on conflict (slug) do nothing;

insert into public.badges (name, slug, description, criteria)
values
  ('Primeiro passo', 'primeiro-passo', 'Conclua sua primeira aula.', '{"lessons_completed": 1}'),
  ('Constância', 'constancia', 'Pratique por sete dias.', '{"practice_days": 7}'),
  ('Ouvido atento', 'ouvido-atento', 'Conclua cinco aulas de percepção.', '{"lessons_completed": 5}')
on conflict (slug) do nothing;