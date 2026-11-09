-- Prepara o banco para produção:
--   1. Fecha brechas de segurança (aluno não pode mais mudar o próprio
--      papel, XP ou nível, nem inventar sessões de prática).
--   2. Salva o instrumento escolhido no cadastro direto pelo trigger,
--      sem depender do navegador da pessoa.
--   3. Progresso real: concluir uma aula dá XP, conta a sequência de dias,
--      desbloqueia conquistas e alimenta o ranking.
--   4. Funções de administração de usuários (listar e mudar papel).
-- Seguro para rodar uma vez depois das migrations anteriores.

-- ---------------------------------------------------------------------
-- 1. Segurança
-- ---------------------------------------------------------------------

-- A policy de update de profiles libera a linha inteira para o dono; sem
-- restringir colunas, qualquer aluno poderia se promover a admin ou
-- alterar o próprio XP. Agora só nome e avatar são editáveis pelo usuário;
-- papel, XP e nível só mudam pelas funções security definer abaixo.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- Sessões de prática, XP e conquistas passam a ser gravadas apenas pela
-- função complete_content(); o usuário só lê os próprios registros.
drop policy if exists "Users manage their practice sessions" on public.practice_sessions;
create policy "Users view their practice sessions"
on public.practice_sessions for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Teachers create XP events" on public.xp_events;
drop policy if exists "Teachers manage awarded badges" on public.profile_badges;

-- A view leaderboard roda com os privilégios do dono e expunha id e nome
-- de todos os perfis. O ranking agora sai de get_my_journey(), que só
-- devolve primeiro nome + inicial.
revoke all on public.leaderboard from anon, authenticated;

-- Um único instrumento principal por pessoa.
update public.profile_instruments pi
set is_primary = false
where pi.is_primary
  and exists (
    select 1 from public.profile_instruments other
    where other.profile_id = pi.profile_id
      and other.is_primary
      and (other.created_at, other.instrument_id) > (pi.created_at, pi.instrument_id)
  );

create unique index if not exists profile_instruments_one_primary_idx
on public.profile_instruments (profile_id) where is_primary;

-- ---------------------------------------------------------------------
-- 2. Cadastro grava o instrumento principal
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_instrument_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  select id into v_instrument_id
  from public.instruments
  where slug = new.raw_user_meta_data ->> 'instrument';

  if v_instrument_id is not null then
    insert into public.profile_instruments (profile_id, instrument_id, is_primary)
    values (new.id, v_instrument_id, true)
    on conflict (profile_id, instrument_id) do update set is_primary = true;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Progresso, XP, sequência e conquistas
-- ---------------------------------------------------------------------

create table if not exists public.content_completions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  completed_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, content_item_id)
);

alter table public.content_completions enable row level security;

create policy "Users view their completions"
on public.content_completions for select to authenticated
using (user_id = auth.uid());

alter table public.badges
  add column if not exists sort_order integer not null default 0;

delete from public.badges where slug = 'ouvido-atento';

insert into public.badges (name, slug, description, criteria, sort_order)
values
  ('Primeira aula', 'primeiro-passo', 'Conclua sua primeira aula.', '{"lessons_completed": 1}', 1),
  ('7 dias seguidos', 'constancia', 'Pratique por 7 dias seguidos.', '{"streak_days": 7}', 2),
  ('30 dias seguidos', 'maratona', 'Pratique por 30 dias seguidos.', '{"streak_days": 30}', 3),
  ('3 instrumentos', 'explorador', 'Conclua aulas de 3 instrumentos diferentes.', '{"instruments": 3}', 4)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    criteria = excluded.criteria,
    sort_order = excluded.sort_order;

-- Dias seguidos com prática, terminando hoje (ou ontem, se ainda não
-- praticou hoje — a sequência só quebra quando o dia acaba). Usa o fuso
-- de Brasília para o "dia" bater com o do aluno.
create or replace function public.practice_streak(p_user uuid)
returns integer
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_day date := (now() at time zone v_tz)::date;
  v_streak integer := 0;
begin
  if not exists (
    select 1 from practice_sessions
    where user_id = p_user and (practiced_at at time zone v_tz)::date = v_day
  ) then
    v_day := v_day - 1;
  end if;

  while exists (
    select 1 from practice_sessions
    where user_id = p_user and (practiced_at at time zone v_tz)::date = v_day
  ) loop
    v_streak := v_streak + 1;
    v_day := v_day - 1;
  end loop;

  return v_streak;
end;
$$;

revoke execute on function public.practice_streak(uuid) from public, anon, authenticated;

-- Marca um conteúdo como concluído pelo usuário logado. Dá XP só na
-- primeira vez, registra a prática do dia e desbloqueia conquistas.
create or replace function public.complete_content(p_content_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_xp constant integer := 20;
  v_instrument_id uuid;
  v_duration integer;
  v_rows integer;
  v_xp_total integer;
  v_level integer;
  v_streak integer;
  v_completed integer;
  v_instruments integer;
  v_new_badges text[];
begin
  if v_user is null then
    raise exception 'Faça login para concluir aulas.' using errcode = '28000';
  end if;

  select instrument_id, duration_seconds into v_instrument_id, v_duration
  from content_items
  where id = p_content_id and published;
  if not found then
    raise exception 'Conteúdo não encontrado.' using errcode = 'P0002';
  end if;

  insert into content_completions (user_id, content_item_id)
  values (v_user, p_content_id)
  on conflict do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    select xp_total, level into v_xp_total, v_level from profiles where id = v_user;
    return jsonb_build_object(
      'already_completed', true, 'xp_awarded', 0,
      'xp_total', v_xp_total, 'level', v_level, 'new_badges', '[]'::jsonb
    );
  end if;

  insert into practice_sessions (user_id, instrument_id, duration_seconds, xp_earned)
  values (v_user, v_instrument_id, greatest(coalesce(v_duration, 60), 1), v_xp);

  insert into xp_events (user_id, amount, source, reference_id)
  values (v_user, v_xp, 'content_completed', p_content_id);

  update profiles
  set xp_total = xp_total + v_xp,
      level = (xp_total + v_xp) / 100 + 1
  where id = v_user
  returning xp_total, level into v_xp_total, v_level;

  v_streak := practice_streak(v_user);

  select count(*), count(distinct ci.instrument_id)
  into v_completed, v_instruments
  from content_completions cc
  join content_items ci on ci.id = cc.content_item_id
  where cc.user_id = v_user;

  with eligible as (
    select b.id
    from badges b
    where (b.criteria ? 'lessons_completed' and v_completed >= (b.criteria ->> 'lessons_completed')::int)
       or (b.criteria ? 'streak_days' and v_streak >= (b.criteria ->> 'streak_days')::int)
       or (b.criteria ? 'instruments' and v_instruments >= (b.criteria ->> 'instruments')::int)
  ),
  awarded as (
    insert into profile_badges (profile_id, badge_id)
    select v_user, id from eligible
    on conflict do nothing
    returning badge_id
  )
  select coalesce(array_agg(b.name order by b.sort_order), '{}')
  into v_new_badges
  from awarded a
  join badges b on b.id = a.badge_id;

  return jsonb_build_object(
    'already_completed', false, 'xp_awarded', v_xp,
    'xp_total', v_xp_total, 'level', v_level, 'new_badges', to_jsonb(v_new_badges)
  );
end;
$$;

revoke execute on function public.complete_content(uuid) from public, anon;
grant execute on function public.complete_content(uuid) to authenticated;

-- Tudo que a seção "Sua jornada" da home precisa, numa chamada só.
create or replace function public.get_my_journey()
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_tz constant text := 'America/Sao_Paulo';
  v_today date := (now() at time zone v_tz)::date;
  v_week_start date := v_today - (extract(isodow from v_today)::int - 1);
  v_month_start timestamptz := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
begin
  if v_user is null then
    raise exception 'Faça login para ver sua jornada.' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'streak', practice_streak(v_user),
    'xp_month', coalesce((
      select sum(amount) from xp_events
      where user_id = v_user and created_at >= v_month_start
    ), 0),
    'week', (
      select jsonb_agg(exists (
        select 1 from practice_sessions ps
        where ps.user_id = v_user
          and (ps.practiced_at at time zone v_tz)::date = v_week_start + d
      ) order by d)
      from generate_series(0, 6) as d
    ),
    'completed_ids', coalesce((
      select jsonb_agg(content_item_id) from content_completions where user_id = v_user
    ), '[]'::jsonb),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', b.slug, 'name', b.name, 'description', b.description,
        'unlocked', pb.badge_id is not null
      ) order by b.sort_order, b.name)
      from badges b
      left join profile_badges pb on pb.badge_id = b.id and pb.profile_id = v_user
    ), '[]'::jsonb),
    'ranking', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', r.pos,
        'name', r.parts[1] || case
          when array_length(r.parts, 1) > 1 then ' ' || upper(left(r.parts[array_length(r.parts, 1)], 1)) || '.'
          else '' end,
        'xp', r.xp_total,
        'is_you', r.id = v_user
      ) order by r.pos)
      from (
        select p.id, p.xp_total,
               regexp_split_to_array(coalesce(nullif(btrim(p.display_name), ''), 'Aluno'), '\s+') as parts,
               row_number() over (order by p.xp_total desc, p.created_at asc) as pos
        from profiles p
        where (p.role = 'student' and p.xp_total > 0) or p.id = v_user
      ) r
      where r.pos <= 5 or r.id = v_user
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_my_journey() from public, anon;
grant execute on function public.get_my_journey() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Administração de usuários (somente role = 'admin')
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.admin_list_users()
returns table (
  id uuid,
  display_name text,
  email text,
  role public.profile_role,
  xp_total integer,
  primary_instrument text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem gerenciar usuários.' using errcode = '42501';
  end if;

  return query
  select p.id, p.display_name, u.email::text, p.role, p.xp_total, i.name,
         p.created_at, u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.profile_instruments pi on pi.profile_id = p.id and pi.is_primary
  left join public.instruments i on i.id = pi.instrument_id
  order by p.created_at desc;
end;
$$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.profile_role)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem gerenciar usuários.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Você não pode alterar o seu próprio papel.' using errcode = '22023';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_set_user_role(uuid, public.profile_role) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.profile_role) to authenticated;
