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

## Comunidade

A página `FrontEnd/community.html` integra a Comunidade ao site existente. Ela reutiliza a autenticação de `FrontEnd/src/session.ts` (compilada para `FrontEnd/session.js`) e a API Python existente, sem adicionar frameworks ou dependências.

### Funcionalidades incluídas

- Feed de publicações em texto e compartilhamento de links de música/vídeo.
- Curtidas e comentários em publicações.
- Lista de membros, com distinção visual de alunos, professores e administradores, e ação para seguir pessoas.
- Página de perfil própria e páginas públicas de outros membros, acessíveis pelos nomes no feed e pela lista de pessoas; é possível seguir ou deixar de seguir pelo perfil.
- Grupos musicais: criação, entrada/saída e mensagens para membros.
- Informes oficiais publicados por professores e administradores.
- Layout responsivo alinhado às fontes, cores e componentes visuais da página inicial.

### Instalação/atualização

1. Faça uma cópia de segurança do projeto atual e extraia o ZIP de atualização mantendo a pasta `The_Musicalist-fresh` como raiz do projeto.
2. Copie `.env.example` para `.env` e configure `SUPABASE_URL` e `SUPABASE_ANON_KEY`. Não compartilhe nem versione o `.env`.
3. No painel Supabase, abra **SQL Editor** e execute `supabase/migrations/20261018000100_community.sql`, depois de todas as migrations anteriores listadas acima. A migration cria as tabelas sociais e as políticas RLS necessárias.
4. Na pasta raiz, execute `npm install` e `npm run build` para compilar os arquivos TypeScript existentes. A página da comunidade usa `community.js` diretamente e não requer compilação adicional.
5. Inicie o servidor existente com `python BackEnd/login.py` (Python 3.10+ recomendado) e abra `http://localhost:8001/community.html` após fazer login. Os links **Comunidade** e **Meu perfil** estão na navegação da home. Na Comunidade, selecione um membro para abrir o perfil dele.
6. Para validar: crie uma publicação, curta e comente; siga outro perfil; crie um grupo, participe e envie uma mensagem; entre com conta `teacher` ou `admin` para publicar um informe oficial.

### Arquivos adicionados/modificados

- **Novos:** `BackEnd/community.py`, `FrontEnd/community.html`, `FrontEnd/community.css`, `FrontEnd/community-theme.css`, `FrontEnd/community.js`, `FrontEnd/profile.html`, `FrontEnd/profile.js`, `supabase/migrations/20261018000100_community.sql`, `.env.example`.
- **Modificados:** `BackEnd/login.py`, `FrontEnd/home.html`, `README.md`.
- Os caminhos existentes foram preservados. Este pacote contém uma cópia de trabalho do projeto sem `.git`, caches Python ou `.env`; não contém credenciais e não deve ser tratado como backup de configurações locais.

### Observações importantes

- A migração é necessária antes de abrir a página; caso contrário, a API retornará erro de tabela inexistente.
- A autorização das operações é aplicada no backend e no Row Level Security do Supabase. Professores/administradores são os únicos autorizados a publicar informes oficiais.
- O compartilhamento de mídia usa links externos `http(s)`; o site não baixa nem hospeda automaticamente esses arquivos.
- A amizade mútua é representada por seguimento recíproco: quando A segue B e B segue A, a interface identifica ambos como amigos. É possível seguir e deixar de seguir pessoas.
