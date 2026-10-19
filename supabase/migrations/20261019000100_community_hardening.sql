-- Correções de segurança e consistência da Comunidade.
-- Aplicar depois de 20261018000100_community.sql.

-- ============================================================
-- 1. View pública limitada para perfis da comunidade
-- ============================================================

create or replace view public.community_profiles
with (security_invoker = false)
as
select
  id,
  display_name,
  avatar_url,
  role
from public.profiles;

revoke all on public.community_profiles from anon;
grant select on public.community_profiles to authenticated;

-- A migration original substituiu a policy de perfil por uma policy
-- que libera a tabela profiles inteira. Removemos essa exposição.
drop policy if exists "Authenticated users can view community profiles"
on public.profiles;

-- Mantém a leitura do próprio perfil. Administradores e professores
-- continuam podendo consultar perfis conforme a regra original.
create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin_or_teacher()
);

-- ============================================================
-- 2. Função segura para verificar participação em grupo
-- ============================================================

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_group_members
    where group_id = p_group_id
      and user_id = auth.uid()
  );
$$;

revoke execute on function public.is_group_member(uuid)
from public, anon;

grant execute on function public.is_group_member(uuid)
to authenticated;

-- ============================================================
-- 3. Groups: leitura somente para membros
-- ============================================================

drop policy if exists "Authenticated can read group posts"
on public.community_group_posts;

create policy "Members can read group posts"
on public.community_group_posts
for select
to authenticated
using (
  public.is_group_member(group_id)
);

drop policy if exists "Members post in groups"
on public.community_group_posts;

create policy "Members post in groups"
on public.community_group_posts
for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.is_group_member(group_id)
);

-- ============================================================
-- 4. Impedir que o dono saia do próprio grupo
-- ============================================================

drop policy if exists "Users manage own membership"
on public.community_group_members;

create policy "Users join or leave groups"
on public.community_group_members
for all
to authenticated
using (
  user_id = auth.uid()
  and not exists (
    select 1
    from public.community_groups g
    where g.id = group_id
      and g.owner_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
);

-- O dono pode ser consultado e permanece como membro.
create policy "Owners can view own group membership"
on public.community_group_members
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.community_groups g
    where g.id = group_id
      and g.owner_id = auth.uid()
  )
);

-- ============================================================
-- 5. Adicionar automaticamente o dono como membro
-- ============================================================

create or replace function public.add_group_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.community_group_members (group_id, user_id)
  values (new.id, new.owner_id)
  on conflict (group_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists community_group_owner_membership
on public.community_groups;

create trigger community_group_owner_membership
after insert on public.community_groups
for each row
execute function public.add_group_owner_as_member();

-- ============================================================
-- 6. Limites adicionais para conteúdo da comunidade
-- ============================================================

alter table public.community_posts
  drop constraint if exists community_posts_music_url_length_check;

alter table public.community_posts
  add constraint community_posts_music_url_length_check
  check (
    music_url is null
    or char_length(music_url) <= 2000
  );

-- ============================================================
-- 7. Moderação de publicações e comentários
-- ============================================================

create policy "Staff can delete community posts"
on public.community_posts
for delete
to authenticated
using (
  public.is_admin_or_teacher()
);

create policy "Staff can delete community comments"
on public.community_comments
for delete
to authenticated
using (
  public.is_admin_or_teacher()
);

create policy "Staff can delete group posts"
on public.community_group_posts
for delete
to authenticated
using (
  public.is_admin_or_teacher()
);

drop policy if exists "Teachers manage content"
on public.content_items;

create policy "Staff manage own or all content"
on public.content_items
for all
to authenticated
using (
  public.is_admin()
  or (
    public.is_admin_or_teacher()
    and author_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or (
    public.is_admin_or_teacher()
    and author_id = auth.uid()
  )
);

drop policy if exists "Teachers manage content assets"
on public.content_assets;

create policy "Staff manage own or all content assets"
on public.content_assets
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.content_items c
    where c.id = content_item_id
      and c.author_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.content_items c
    where c.id = content_item_id
      and c.author_id = auth.uid()
  )
);