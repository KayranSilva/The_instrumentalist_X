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

3. (Opcional) Rode `supabase/seed.sql` para ter aulas de exemplo em todos os instrumentos.

4. Crie o usuário admin pelo painel (Authentication → Users → Add user) e promova-o:
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'SEU-EMAIL-ADMIN');
   ```

## Backend

```bash
python BackEnd/login.py
```

Sobe em `http://localhost:8001`, serve o frontend estático e expõe as rotas de API: `/register`, `/login`, `/recover`, `/refresh`, `/instruments`, `/profile/instrument`, `/homepage` e `/admin/content` (GET/POST/DELETE). Todas as rotas que leem ou gravam dados do usuário exigem `Authorization: Bearer <access_token>` — o backend nunca guarda a `service_role key`; ele repassa o token da própria pessoa autenticada, e o RLS do Supabase decide o que cada uma pode fazer.

## Frontend

Os scripts ficam em `FrontEnd/src` como TypeScript (sem bundler — cada arquivo compila para o `.js` de mesmo nome usado pelo HTML).

```bash
npm install
npm run build       # gera os .js
npm run typecheck   # só verifica tipos, sem gerar arquivos
```

## Fluxo de cadastro e login

O cadastro salva o usuário em `auth.users` (o trigger da migration cria o registro em `public.profiles`). No cadastro, a pessoa escolhe um instrumento/objetivo principal; como a confirmação de e-mail está ativa, essa escolha fica guardada no navegador e é salva em `public.profile_instruments` (`is_primary = true`) assim que ela faz login pela primeira vez — isso não limita o acesso aos demais instrumentos.

No login, quem tem `profiles.role` igual a `admin` ou `teacher` é redirecionado para o painel administrativo; os demais vão para a home.

## Home personalizada

A home busca as aulas publicadas (`content_items`) agrupadas por instrumento, sempre com o instrumento principal do usuário em primeiro lugar.

## Administração

Acesse pelo `login.html` com uma conta `admin`/`teacher` — não existe mais chave de acesso fixa. O painel publica e remove aulas, músicas e partituras diretamente em `public.content_items`/`public.content_assets`; arquivos enviados vão para o bucket público `lesson-assets` no Supabase Storage. Só quem tem `role` de admin/professor consegue publicar — a aplicação dessa regra é feita pelo RLS do banco, não só pela tela.
