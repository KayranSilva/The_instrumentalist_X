-- Exercício com reconhecimento de áudio: gabarito de notas anexado a uma aula.
-- A aula continua sendo um content_item comum (type = 'lesson'); home, player
-- e app não mudam. Nada da prática do aluno é gravado no banco.

create table public.lesson_exercises (
  content_item_id uuid primary key references public.content_items(id) on delete cascade,
  notes jsonb not null check (jsonb_typeof(notes) = 'array' and jsonb_array_length(notes) between 1 and 200),
  reference_asset_id uuid references public.content_assets(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.lesson_exercises enable row level security;

create policy "Users view exercises of published lessons"
on public.lesson_exercises for select to authenticated
using (
  public.is_admin_or_teacher()
  or exists (
    select 1 from public.content_items c
    where c.id = content_item_id and c.published
  )
);

create policy "Teachers insert exercises"
on public.lesson_exercises for insert to authenticated
with check (public.is_admin_or_teacher());

create policy "Teachers update exercises"
on public.lesson_exercises for update to authenticated
using (public.is_admin_or_teacher())
with check (public.is_admin_or_teacher());

create policy "Teachers delete exercises"
on public.lesson_exercises for delete to authenticated
using (public.is_admin_or_teacher());

grant select, insert, update, delete on public.lesson_exercises to authenticated;
