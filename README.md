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
   - `supabase/migrations/20261018000100_community.sql` e `supabase/migrations/20261019000100_community_hardening.sql` (comunidade)
   - `supabase/migrations/20261107000000_lesson_exercises.sql` (exercícios com reconhecimento de áudio)
   - `20261108000000_plans_and_simulated_payments.sql`
   - `20261108000100_cancel_subscription.sql`

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

Sobe em `http://localhost:8001` (abre direto no login), serve o frontend estático e expõe as rotas de API: `/register`, `/login`, `/logout`, `/recover`, `/password`, `/refresh`, `/me`, `/instruments`, `/profile/instrument`, `/homepage`, `/content/<id>/complete`, `/admin/content` (GET/POST, PATCH/DELETE em `/admin/content/<id>`), `/content/<id>/exercise` (GET), `/admin/content/<id>/exercise` (PUT/DELETE), `/admin/teachers`, `/admin/users` e `/admin/users/<id>/role`. Limite de upload: 50 MB por arquivo (mude com `MAX_UPLOAD_MB` no `.env`, respeitando o limite do bucket no Supabase). Todas as rotas que leem ou gravam dados do usuário exigem `Authorization: Bearer <access_token>` — o backend nunca guarda a `service_role key`; ele repassa o token da própria pessoa autenticada, e o RLS do Supabase decide o que cada uma pode fazer.

## Frontend

Os scripts ficam em `FrontEnd/src` como TypeScript (sem bundler — cada arquivo compila para o `.js` de mesmo nome usado pelo HTML). `session.ts` é compartilhado por todas as páginas (sessão, renovação automática do token, chamadas à API) e precisa ser carregado antes dos demais. **Depois de editar qualquer `.ts`, rode `npm run build`** — o navegador só lê os `.js`.

```bash
npm install
npm run build       # gera os .js
npm run typecheck   # só verifica tipos, sem gerar arquivos
npm test            # compila e roda os testes de detecção de notas e avaliação (node --test, sem dependências)
```

## Fluxo de cadastro e login

O cadastro salva o usuário em `auth.users`; o trigger cria o registro em `public.profiles` e já grava o instrumento escolhido (cartões clicáveis, sem texto livre) em `public.profile_instruments` com `is_primary = true` — funciona mesmo que a pessoa confirme o e-mail em outro aparelho. O link de confirmação faz login automático. A troca de instrumento principal fica no menu do usuário na home. "Esqueci minha senha" envia um link que abre `reset.html`.

No login, quem tem `profiles.role` igual a `admin` ou `teacher` é redirecionado para o painel administrativo; os demais vão para a home.

## Home personalizada

A home busca os conteúdos publicados (aulas, músicas e partituras) agrupados por instrumento, sempre com o instrumento principal em primeiro lugar. Clicar num conteúdo abre o player (vídeo/áudio enviado, YouTube, Vimeo ou PDF). "Marcar como concluída" chama a função `complete_content()` do banco: +20 XP na primeira vez, registra o dia de prática (sequência), sobe de nível a cada 100 XP e desbloqueia conquistas. O ranking mostra só primeiro nome + inicial. Admins e professores podem usar a área do aluno e veem um link para o painel.

## Administração

Acesse pelo login com uma conta `admin`/`teacher`. O painel publica, edita (inclusive como rascunho) e exclui aulas, músicas e partituras; arquivos vão para o bucket `lesson-assets` e são apagados junto com o conteúdo. O professor de cada conteúdo é escolhido numa lista de professores/admins cadastrados. Administradores também têm a aba **Usuários**, para promover alguém a professor ou admin sem SQL (ninguém pode alterar o próprio papel). Administradores e professores continuam com acesso à área do aluno, incluindo seleção de instrumento principal e registro de progresso. Todas essas regras são garantidas pelo banco (RLS + funções), não só pela tela: alunos não conseguem alterar papel, XP ou nível nem com chamadas diretas à API.

## Aula com reconhecimento de áudio (versão de testes)

Design completo em `docs/superpowers/specs/2026-11-07-aula-reconhecimento-audio-design.md`. Só no site (o app mostra a aula normalmente) e sem ligação com XP: nada da prática é salvo.

- **Professor** (painel → formulário de *Aula*): marque **Exercício com reconhecimento de áudio**. Clique em **Analisar notas** para o site sugerir as notas a partir do arquivo da aula (ou de um áudio de referência, obrigatório quando a aula usa link do YouTube/Vimeo). Revise as fichas (clique troca a nota, `×` apaga, `+` insere; a ficha mostra o segundo em que a nota apareceu e faz a pré-visualização pular para lá), ou digite as notas no campo de texto, ex.: `C4 D4 E4 F4 G4 A4 B4 C5`. **▶ Ouvir** toca o gabarito a 60 BPM. Salvar a aula salva o gabarito; desmarcar a caixa remove o exercício. Não disponível para bateria e composição.
- **Aluno**: no player da aula aparece **🎤 Praticar com microfone** (`practice.html?id=<aula>`). Escolha Fácil (60 BPM), Médio (120) ou Difícil (180), ouça o exemplo, teste o microfone e toque uma nota por clique depois da contagem de 4. O relatório mostra notas certas, no tempo, tendência de adiantar/atrasar, oitava diferente (não é erro), problemas nota a nota e uma dica.
- A detecção (YIN) roda no navegador, em `FrontEnd/src/pitch.ts`; a avaliação em `exercise-score.ts`. Precisa de Chrome ou Firefox no computador, em `http://localhost` ou `https://` (o navegador só libera o microfone em página segura). Use fone de ouvido.

### Teste rápido com a escala de dó maior

1. Aplique a migration `20261107000000_lesson_exercises.sql` e rode `npm run build`.
2. No painel, crie uma **Aula** de violão/guitarra/piano (arquivo ou link), marque o exercício e digite `C4 D4 E4 F4 G4 A4 B4 C5` (ou envie um áudio seu tocando a escala e clique em **Analisar notas**). Publique.
3. Entre como aluno (ou use a área do aluno), abra a aula e clique em **Praticar com microfone**. Comece pelo Fácil. No violão/guitarra, o C4 é o Dó da 1ª casa da 2ª corda — se tocar a escala uma oitava abaixo (C3, 3ª casa da 5ª corda), o relatório só avisa da oitava.

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

## App mobile (Expo)

A pasta `mobile/` tem o app Android/iOS (Expo SDK 57 (expo 57.0.9) + Expo Router, TypeScript), que roda no **Expo Go**. Ele usa o **mesmo projeto Supabase** do site, direto pelo `@supabase/supabase-js` (sessão salva no AsyncStorage e renovada automaticamente) — não precisa do servidor Python ligado. O site continua igual.

O app tem as mesmas funções do site, adaptadas ao celular, em quatro abas:

- **Início:** saudação, "continue de onde parou", sequência, XP do mês e nível, conteúdos do instrumento principal, "Explore por instrumento" e a jornada completa (nível, semana, conquistas e ranking).
- **Aulas:** conteúdos por instrumento, player (vídeo/áudio enviados, YouTube e Vimeo, com "Marcar como concluída") e visualizador de PDF (nativo no iOS; PDF.js no Android, com opção de abrir fora do app).
- **Comunidade:** feed (publicar com link musical, curtir, comentar), grupos (criar, entrar/sair, conversas), pessoas (seguir) e informes oficiais (professores/admins publicam). Os nomes abrem o perfil público.
- **Conta (configurações):** meu perfil, trocar instrumento principal, painel administrativo (professores/admins), gerenciar usuários (admins) e sair.

O painel no app publica, edita e exclui aulas, músicas e partituras, com envio de arquivo (barra de progresso, até 50 MB) ou link, rascunhos, busca e filtros. A gestão de usuários muda papéis. No login há "Esqueci minha senha": o link do e-mail abre a tela de nova senha do site.

```bash
cd mobile
cp .env.example .env   # EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY (mesmos valores do .env da raiz)
npm install
npx expo start         # escaneie o QR code com o Expo Go (Android) ou a Câmera (iOS)
npm run typecheck
```

- Celular e computador precisam estar na mesma rede (ou use `npx expo start --tunnel`). O Expo Go instalado tem que suportar o SDK 57. `expo` e `react-native` estão fixados (57.0.9 e 0.86.2) e excluídos do `npx expo install --fix` em `mobile/package.json`.
- Instale pacotes com `npx expo install <pacote>` para pegar versões compatíveis com o SDK. Bibliotecas com código nativo fora do Expo Go exigiriam um *development build*.
- Cadastro: o app envia `name` e `instrument` nos metadados, como o site, e o trigger cria o perfil. Se o Supabase exigir confirmação de e-mail, o link abre o site; depois é só entrar no app.
- As regras são as mesmas do site: o app fala direto com o Supabase e o RLS decide o que cada papel pode fazer.
