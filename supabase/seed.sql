-- Dados de exemplo (seed) para a home ter conteúdo durante os testes.
-- Todos marcados com published = true e sem author_id (sem usuário fictício).
-- Para remover depois, use o DELETE no final deste arquivo.

insert into public.content_items
  (type, title, description, instrument_id, instructor_name, level, duration_seconds, external_url, published)
values
  ('lesson', 'Dedilhado com métrica 6/8', 'Pratique o dedilhado em compasso composto no violão.',
   (select id from public.instruments where slug = 'violao'), 'Rafael Nunes', 'beginner', 860,
   'https://www.youtube.com/watch?v=demo', true),

  ('lesson', 'Acordes de sétima na prática', 'Como usar acordes de sétima em progressões populares.',
   (select id from public.instruments where slug = 'piano'), 'Bianca Rocha', 'intermediate', 585,
   'https://www.youtube.com/watch?v=demo', true),

  ('lesson', 'Groove básico de samba', 'Introdução ao groove de samba na bateria.',
   (select id from public.instruments where slug = 'bateria'), 'Diego Alves', 'beginner', 670,
   'https://www.youtube.com/watch?v=demo', true),

  ('lesson', 'Respiração e apoio vocal', 'Fundamentos de respiração para cantar com apoio.',
   (select id from public.instruments where slug = 'canto'), 'Aline Souza', 'beginner', 450,
   'https://www.youtube.com/watch?v=demo', true),

  ('lesson', 'Afinação e postura do arco', 'Como afinar o violino e posicionar o arco corretamente.',
   (select id from public.instruments where slug = 'violino'), 'Camila Duarte', 'beginner', 615,
   'https://www.youtube.com/watch?v=demo', true),

  ('lesson', 'Primeiros acordes no ukulele', 'Os quatro acordes essenciais para começar no ukulele.',
   (select id from public.instruments where slug = 'ukulele'), 'Bia Ramos', 'beginner', 510,
   'https://www.youtube.com/watch?v=demo', true),

  ('lesson', 'Power chords e palhetada básica', 'Introdução aos power chords e à palhetada na guitarra.',
   (select id from public.instruments where slug = 'guitarra'), 'Diego Alves', 'beginner', 760,
   'https://www.youtube.com/watch?v=demo', true),

  ('lesson', 'Estrutura de uma canção popular', 'Como organizar introdução, verso e refrão ao compor.',
   (select id from public.instruments where slug = 'composicao'), 'Rafael Nunes', 'beginner', 900,
   'https://www.youtube.com/watch?v=demo', true);

-- Para remover todo o conteúdo de exemplo depois dos testes:
-- delete from public.content_items where external_url = 'https://www.youtube.com/watch?v=demo';
