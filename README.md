# The Instrumentalist X

## Configuração (Supabase)

O projeto usa o Supabase para autenticação e dados. Antes de rodar qualquer coisa:

1. Copie `.env.example` para `.env` na raiz do projeto e preencha com os valores do seu projeto Supabase (Settings → API):
   ```
   SUPABASE_URL=https://SEU-PROJETO.supabase.co
   SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA
   ```
   O `.env` nunca é versionado (está no `.gitignore`). A chave anon/publishable é pública por natureza — quem protege os dados é o RLS do banco, não o sigilo dessa chave.

2. Aplique as migrations, na ordem, pelo SQL Editor do painel do Supabase (ou `supabase db push` se tiver o projeto linkado via CLI):
   - `supabase/migrations/20260914000000_initial_schema.sql`
   - `supabase/migrations/20261017000000_instruments_and_content_updates.sql`
   - `supabase/migrations/20261017000100_backfill_missing_profiles.sql`
   - `supabase/migrations/20261018000000_security_progress_and_admin.sql` (segurança, progresso/XP e gestão de usuários)

3. (Opcional) Rode `supabase/seed.sql` para ter aulas de exemplo em todos os instrumentos.

4. Em **Authentication → URL Configuration**, defina o *Site URL* (ex.: `http://localhost:8001`) e adicione em *Redirect URLs* `http://localhost:8001/**` (e o domínio de produção, quando houver). Sem isso, os links de confirmação de e-mail e de redefinição de senha não voltam para o site.

5. Crie o usuário admin pelo painel (Authentication → Users → Add user) e promova-o:
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'SEU-EMAIL-ADMIN');
   ```

## Backend

```bash
python BackEnd/login.py
```

Sobe em `http://localhost:8001` (abre direto no login), serve o frontend estático e expõe as rotas de API: `/register`, `/login`, `/logout`, `/recover`, `/password`, `/refresh`, `/me`, `/instruments`, `/profile/instrument`, `/homepage`, `/content/<id>/complete`, `/admin/content` (GET/POST, PATCH/DELETE em `/admin/content/<id>`), `/admin/teachers`, `/admin/users` e `/admin/users/<id>/role`. Limite de upload: 50 MB por arquivo (mude com `MAX_UPLOAD_MB` no `.env`, respeitando o limite do bucket no Supabase). Todas as rotas que leem ou gravam dados do usuário exigem `Authorization: Bearer <access_token>` — o backend nunca guarda a `service_role key`; ele repassa o token da própria pessoa autenticada, e o RLS do Supabase decide o que cada uma pode fazer.

## Frontend

Os scripts ficam em `FrontEnd/src` como TypeScript (sem bundler — cada arquivo compila para o `.js` de mesmo nome usado pelo HTML). `session.ts` é compartilhado por todas as páginas (sessão, renovação automática do token, chamadas à API) e precisa ser carregado antes dos demais. **Depois de editar qualquer `.ts`, rode `npm run build`** — o navegador só lê os `.js`.

```bash
npm install
npm run build       # gera os .js
npm run typecheck   # só verifica tipos, sem gerar arquivos
```

## Fluxo de cadastro e login

O cadastro salva o usuário em `auth.users`; o trigger cria o registro em `public.profiles` e já grava o instrumento escolhido (cartões clicáveis, sem texto livre) em `public.profile_instruments` com `is_primary = true` — funciona mesmo que a pessoa confirme o e-mail em outro aparelho. O link de confirmação faz login automático. A troca de instrumento principal fica no menu do usuário na home. "Esqueci minha senha" envia um link que abre `reset.html`.

No login, quem tem `profiles.role` igual a `admin` ou `teacher` é redirecionado para o painel administrativo; os demais vão para a home.

## Home personalizada

A home busca os conteúdos publicados (aulas, músicas e partituras) agrupados por instrumento, sempre com o instrumento principal em primeiro lugar. Clicar num conteúdo abre o player (vídeo/áudio enviado, YouTube, Vimeo ou PDF). "Marcar como concluída" chama a função `complete_content()` do banco: +20 XP na primeira vez, registra o dia de prática (sequência), sobe de nível a cada 100 XP e desbloqueia conquistas. O ranking mostra só primeiro nome + inicial. Admins e professores veem um link para o painel.

## Administração

Acesse pelo login com uma conta `admin`/`teacher`. O painel publica, edita (inclusive como rascunho) e exclui aulas, músicas e partituras; arquivos vão para o bucket `lesson-assets` e são apagados junto com o conteúdo. O professor de cada conteúdo é escolhido numa lista de professores/admins cadastrados. Administradores também têm a aba **Usuários**, para promover alguém a professor ou admin sem SQL (ninguém pode alterar o próprio papel). Todas essas regras são garantidas pelo banco (RLS + funções), não só pela tela: alunos não conseguem alterar papel, XP ou nível nem com chamadas diretas à API.
