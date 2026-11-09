-- XP para prática com reconhecimento de notas.
-- Uma recompensa por conteúdo/dia e limite de XP diário por usuário.

create table if not exists public.practice_xp_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  practiced_on date not null,
  duration_seconds integer not null check (duration_seconds between 5 and 3600),
  accuracy_percent integer not null check (accuracy_percent between 0 and 100),
  on_time_percent integer not null check (on_time_percent between 0 and 100),
  xp_earned integer not null check (xp_earned > 0),
  created_at timestamptz not null default timezone('utc', now()),
  constraint practice_xp_awards_user_content_day_key unique (user_id, content_item_id, practiced_on)
);

create index if not exists practice_xp_awards_user_day_idx
  on public.practice_xp_awards (user_id, practiced_on);

alter table public.practice_xp_awards enable row level security;

create or replace function public.award_practice_xp(
  p_content_id uuid,
  p_duration_seconds integer,
  p_accuracy_percent integer,
  p_on_time_percent integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_practiced_on date := (timezone('UTC', now()))::date;
  v_instrument_id uuid;
  v_existing_xp integer;
  v_daily_xp integer;
  v_award integer;
  v_xp_total integer;
  v_new_total integer;
  v_level integer;
  v_message text;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.' using errcode = '28000';
  end if;

  if p_content_id is null
     or p_duration_seconds is null or p_duration_seconds < 0 or p_duration_seconds > 3600
     or p_accuracy_percent is null or p_accuracy_percent < 0 or p_accuracy_percent > 100
     or p_on_time_percent is null or p_on_time_percent < 0 or p_on_time_percent > 100 then
    raise exception 'Dados da prática inválidos.' using errcode = '22023';
  end if;

  select c.instrument_id
    into v_instrument_id
    from public.content_items c
    join public.lesson_exercises e on e.content_item_id = c.id
   where c.id = p_content_id
     and c.type = 'lesson'
     and c.published = true;

  if not found then
    raise exception 'Exercício não encontrado ou indisponível.' using errcode = '22023';
  end if;

  -- Sessões muito curtas não contam para XP nem para a sequência.
  if p_duration_seconds < 5 then
    return jsonb_build_object(
      'eligible', false,
      'xp_awarded', 0,
      'already_awarded', false,
      'message', 'Continue praticando por pelo menos 5 segundos para registrar esta sessão.'
    );
  end if;

  -- Serializa os registros por usuário, evitando ultrapassar o teto em chamadas simultâneas.
  select coalesce(p.xp_total, 0)
    into v_xp_total
    from public.profiles p
   where p.id = v_user_id
   for update;

  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'P0002';
  end if;

  select a.xp_earned
    into v_existing_xp
    from public.practice_xp_awards a
   where a.user_id = v_user_id
     and a.content_item_id = p_content_id
     and a.practiced_on = v_practiced_on;

  if found then
    insert into public.practice_sessions (user_id, instrument_id, duration_seconds, xp_earned)
    values (v_user_id, v_instrument_id, p_duration_seconds, 0);
    return jsonb_build_object(
      'eligible', true,
      'xp_awarded', 0,
      'already_awarded', true,
      'message', 'Prática registrada. Você já ganhou XP por este exercício hoje.',
      'xp_total', v_xp_total,
      'level', floor(v_xp_total / 100.0)::integer + 1
    );
  end if;

  select coalesce(sum(a.xp_earned), 0)
    into v_daily_xp
    from public.practice_xp_awards a
   where a.user_id = v_user_id
     and a.practiced_on = v_practiced_on;

  -- +5 XP por sessão; +3 de bônus por execução precisa. Limite: 30 XP/dia.
  v_award := 5 + case
    when p_accuracy_percent >= 90 and p_on_time_percent >= 80 then 3
    else 0
  end;
  v_award := least(v_award, greatest(0, 30 - v_daily_xp));

  if v_award > 0 then
    insert into public.practice_xp_awards (
      user_id, content_item_id, practiced_on, duration_seconds,
      accuracy_percent, on_time_percent, xp_earned
    ) values (
      v_user_id, p_content_id, v_practiced_on, p_duration_seconds,
      p_accuracy_percent, p_on_time_percent, v_award
    );

    v_new_total := v_xp_total + v_award;
    v_level := floor(v_new_total / 100.0)::integer + 1;
    update public.profiles
       set xp_total = v_new_total,
           level = v_level,
           updated_at = timezone('utc', now())
     where id = v_user_id;

    insert into public.xp_events (user_id, amount, source, reference_id)
    values (v_user_id, v_award, 'practice', p_content_id);

    v_message := '+' || v_award || ' XP! Prática registrada.';
  else
    v_new_total := v_xp_total;
    v_level := floor(v_new_total / 100.0)::integer + 1;
    v_message := 'Prática registrada; você já atingiu o limite de XP de hoje.';
  end if;

  -- O RPC de jornada existente usa practice_sessions para contar dias praticados.
  insert into public.practice_sessions (user_id, instrument_id, duration_seconds, xp_earned)
  values (v_user_id, v_instrument_id, p_duration_seconds, v_award);

  return jsonb_build_object(
    'eligible', true,
    'xp_awarded', v_award,
    'already_awarded', false,
    'message', v_message,
    'xp_total', v_new_total,
    'level', v_level
  );
end;
$$;

revoke all on function public.award_practice_xp(uuid, integer, integer, integer) from public, anon;
grant execute on function public.award_practice_xp(uuid, integer, integer, integer) to authenticated;
