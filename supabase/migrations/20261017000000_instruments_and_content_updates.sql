-- Adiciona instrumentos que faltavam, abre a leitura pública de instrumentos
-- (necessária na tela de cadastro, antes do login) e acrescenta o nome do
-- professor em content_items, além da infraestrutura de Storage para os
-- arquivos de aula publicados pelo painel administrativo.

insert into public.instruments (name, slug, icon)
values
  ('Guitarra', 'guitarra', 'guitarra'),
  ('Composição', 'composicao', 'composicao')
on conflict (slug) do nothing;

alter table public.content_items
  add column if not exists instructor_name text;

-- A tela de cadastro precisa listar os instrumentos antes do usuário ter
-- sessão (ainda é "anon"). A policy já existente continua valendo para
-- usuários autenticados; esta cobre o visitante.
create policy "Anyone can view instruments"
on public.instruments for select to anon
using (true);

-- Bucket público para vídeos/PDFs das aulas publicadas pelo painel.
insert into storage.buckets (id, name, public)
values ('lesson-assets', 'lesson-assets', true)
on conflict (id) do nothing;

create policy "Public can read lesson assets"
on storage.objects for select
using (bucket_id = 'lesson-assets');

create policy "Teachers manage lesson assets"
on storage.objects for all to authenticated
using (bucket_id = 'lesson-assets' and public.is_admin_or_teacher())
with check (bucket_id = 'lesson-assets' and public.is_admin_or_teacher());
