# Aula com reconhecimento de áudio — Design

Data: 2026-11-07 · Status: implementado (versão de testes)

## Objetivo

Permitir que o professor publique uma aula de **exercício** (ex.: escala pentatônica na guitarra) cujo gabarito de notas é extraído do áudio do vídeo da aula e revisado por ele. O aluno abre o microfone no site, toca o exercício em uma de três dificuldades e recebe um relatório dizendo o que acertou, errou e o que precisa melhorar.

Esta é uma **primeira versão para testes**: o escopo é deliberadamente pequeno e será ajustado depois.

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Origem do gabarito | A plataforma analisa o áudio e **sugere** as notas; o professor revisa/corrige antes de publicar |
| Plataforma | **Só site** nesta versão. O app mobile mostra a aula normalmente, sem prática com microfone |
| Fonte do áudio | Exige **arquivo enviado**. Aula com link YouTube/Vimeo precisa de um áudio de referência extra |
| Retorno ao aluno | **Só relatório no final** (sem cores durante a execução) |
| Progresso / XP | **Sem ligação** com XP, conclusão ou sequência. Tentativas **não** são salvas |
| Detecção | Algoritmo **YIN próprio em TypeScript**, sem dependências; isolado para poder ser trocado depois (ex.: Basic Pitch) |
| Notação | Inglesa com oitava (A3, C4…) |
| Oitava diferente | **Não é erro** — aviso à parte, não derruba a porcentagem |
| Dificuldades | Fácil 60 BPM · Médio 120 BPM · Difícil 180 BPM, uma nota por tempo, fixos no código |

Fora do escopo: acordes/polifonia, bateria, prática no app, feedback em tempo real, histórico de tentativas, XP, vídeo do professor na tela de prática, BPM configurável.

## 1. Arquitetura e banco

Um exercício é uma **aula comum** (`content_items.type = 'lesson'`) com um gabarito anexado. Home, player e app continuam funcionando sem alteração.

### Migration `supabase/migrations/20261107000000_lesson_exercises.sql`

```sql
create table public.lesson_exercises (
  content_item_id uuid primary key references public.content_items(id) on delete cascade,
  notes jsonb not null check (jsonb_typeof(notes) = 'array' and jsonb_array_length(notes) between 1 and 200),
  reference_asset_id uuid references public.content_assets(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);
```

- `notes`: array de strings no formato `^[A-G]#?[0-8]$` (ex.: `["A3","C4","D4"]`), uma nota por tempo, em ordem. Sustenidos apenas (sem bemóis) para ter uma única grafia por nota.
- `reference_asset_id`: arquivo que foi analisado (o asset principal da aula ou o áudio extra).
- RLS:
  - `select`: autenticados, quando o `content_item` correspondente está `published`, ou quando `is_admin_or_teacher()`.
  - `insert/update/delete`: apenas `is_admin_or_teacher()`.
- O áudio de referência extra é guardado em `content_assets` com o mesmo bucket `lesson-assets` e é apagado junto com a aula (comportamento atual de `_remove_assets`). `_remove_assets` deve preservar o asset de referência quando a aula é editada sem trocar a referência.

### Backend (`BackEnd/exercise.py`, rotas registradas em `login.py`)

- `GET /content/<id>/exercise` → `{ notes, reference_url }` ou 404.
- `PUT /admin/content/<id>/exercise` → valida e grava `notes` (e, opcionalmente, recebe o arquivo de referência em multipart, respeitando `MAX_UPLOAD_MB`).
- `DELETE /admin/content/<id>/exercise`.
- Segue o padrão existente: Bearer token do usuário repassado ao Supabase; RLS decide.
- Validação no backend: 1–200 notas, cada uma casando o regex acima; aula deve ser do tipo `lesson`.

### Frontend (`FrontEnd/src/`, compilado com `npm run build`)

| Arquivo | Responsabilidade |
|---|---|
| `pitch.ts` | Detecção: `detectNotes(samples: Float32Array, sampleRate, range) → DetectedNote[]` (`{ note, midi, time, clarity }`). Sem DOM. Também `midiToName`/`nameToMidi`. |
| `exercise-score.ts` | `scoreAttempt(expected: string[], played: DetectedNote[], bpm, startTime) → Report`. Sem DOM. |
| `metronome.ts` | Agendamento de cliques e de síntese de notas ("Ouvir") via Web Audio. |
| `practice.ts` + `practice.html` | Tela do aluno. |
| `admin.ts` (alteração) | Seção "Exercício com reconhecimento" no formulário de Aula. |
| `home.ts` (alteração) | Botão "Praticar com microfone" no player quando a aula tem exercício. |

O endpoint de home/player passa a informar `has_exercise: boolean` por aula.

## 2. Detecção de notas (`pitch.ts`)

- Áudio mono, quadros de 2048 amostras com salto de 512 (~11,6 ms a 44,1 kHz).
- **YIN** com limiar 0,15; `clarity = 1 − d'(τ)`. Quadros com clarity < 0,8 ou RMS abaixo do piso de ruído são silêncio/fala.
- Frequência → MIDI arredondado (A4 = 440 Hz).
- **Faixa por instrumento** (descarta fora dela):
  - violão, guitarra: E2–E6 · ukulele: G3–A5 · violino: G3–E7 · canto: E2–C6 · piano: A0–C8
  - bateria e composição: exercício não disponível (caixa oculta no admin).
- **Segmentação**: uma nota é uma sequência de quadros com o mesmo MIDI por ≥ 80 ms. Nota repetida só gera nova entrada se houver **novo ataque** (subida de RMS ≥ 6 dB em relação ao quadro anterior após queda). `time` = início do primeiro quadro estável.
- Arquivo do professor: decodificado com `AudioContext.decodeAudioData` a partir do arquivo enviado (vídeo ou áudio); processado em blocos com `setTimeout`/yield para não travar a tela e reportar progresso.

## 3. Painel do professor (`admin.ts`)

No formulário de **Aula** (somente), caixa **"Exercício com reconhecimento de áudio"**:

1. **Áudio de referência**: o arquivo da aula, por padrão. Se a aula usa link, campo obrigatório para enviar um áudio curto.
2. **"Analisar notas"**: roda `detectNotes` com a faixa do instrumento selecionado, mostra a barra de progresso.
3. **Editor de fichas** `[A3] [C4] …`:
   - clicar troca a nota (seleção nota + oitava, dentro da faixa do instrumento);
   - `×` apaga, `+` insere entre fichas;
   - cada ficha detectada mostra o segundo em que apareceu; clicar faz o vídeo de pré-visualização pular para lá;
   - **▶ Ouvir** sintetiza o gabarito a 60 BPM;
   - contador: "N notas · X s no Fácil / Y s no Difícil".
4. Salvar a aula salva o gabarito (`PUT …/exercise`). Não é possível salvar com a caixa marcada e o gabarito vazio. Desmarcar a caixa numa aula existente chama `DELETE`.
5. Editando aula com exercício: o editor abre com o gabarito salvo; "Analisar notas" de novo pede confirmação antes de substituir.

## 4. Tela do aluno (`practice.html?id=<content_id>`)

**Antes**: escolha Fácil/Médio/Difícil; fichas do gabarito; **▶ Ouvir exemplo** no BPM escolhido; aviso recomendando fone; **teste de microfone** mostrando a nota ouvida ("Ouvindo: E2 ✓") ou dica se nada for captado.

**Durante**: contagem de 4 cliques; metrônomo continua; um marcador neutro anda pelas fichas no ritmo (sem indicar acerto); grava até a última nota + 1 tempo, ou até **Parar**.

**Depois**: analisa a gravação e mostra o relatório; botões **Tentar de novo** e **Mudar dificuldade**.

Detalhes:
- `getUserMedia` com `echoCancellation`, `noiseSuppression` e `autoGainControl` **desligados** (atrapalham a detecção). Permissão negada → instruções para liberar.
- Latência: tempos detectados são deslocados por `baseLatency + outputLatency` do `AudioContext` (quando disponíveis).
- Cliques do metrônomo: notas detectadas cujo início cai até 40 ms após um clique e com duração < 80 ms são descartadas.
- Nada é gravado no banco.
- Aula sem exercício, ou não publicada para o aluno → mensagem e link de volta para a home.

## 5. Avaliação (`exercise-score.ts`)

- **Grade**: o tempo `i` (0-based) ocorre em `start + i × 60 / bpm`, onde `start` é o primeiro tempo após a contagem.
- **Casamento**: para cada tempo, consideram-se as notas tocadas com início na janela `±½ tempo`; escolhe-se a de mesma classe de nota mais próxima no tempo, senão a mais próxima. Cada nota tocada casa com no máximo um tempo. As que sobram são **extras**.
- **Tolerância de tempo**: Fácil ±150 ms · Médio ±100 ms · Difícil ±70 ms.
- **Resultado por nota do gabarito**:
  - ✅ certa e no tempo — mesmo MIDI, dentro da tolerância
  - 🔵 oitava diferente — mesma classe de nota, outro MIDI; conta como **certa** (o tempo é avaliado normalmente)
  - 🟡 certa, fora do tempo — adiantada/atrasada além da tolerância
  - ❌ errada — outra classe de nota ("tocou F4 em vez de E4")
  - ⚪ faltou — nada na janela
- **Relatório**:
  - Notas certas: `certas / total` (inclui oitava diferente)
  - No tempo: `no tempo / certas`
  - Tendência: média do desvio das notas certas ("você tende a atrasar, +90 ms"), mostrada se |média| > 40 ms
  - Oitava: se ≥ 80% das notas certas estão deslocadas pela **mesma** quantidade de oitavas → mensagem única "Você tocou tudo uma oitava acima/abaixo" em vez de avisos por nota
  - Lista de problemas (erradas, faltou, fora do tempo), com o número da nota
  - Extras: "N notas a mais"
  - Faixa de fichas coloridas com o resultado de cada nota
  - **Dica principal** (primeira regra que se aplica):
    1. certas ≥ 90% e no tempo ≥ 80% → "Muito bem! Tente o próximo nível." (no Difícil: "Exercício dominado!")
    2. certas < 60% → "Volte para o Fácil e foque nas notas X–Y" (trecho de 4 notas com mais erros)
    3. certas ≥ 60% e no tempo < 60% → "As notas estão certas; foque no ritmo com o metrônomo."
    4. caso geral → "Repita focando nas notas X–Y."

## 6. Testes

Sem framework novo: `node` executa testes compilados de `pitch.ts` e `exercise-score.ts` (funções puras), com um script `npm test`.

- `pitch`: senoides sintéticas (A4 440 Hz → A4; E2 82,4 Hz → E2); sequência sintética a 120 BPM gera as notas e tempos corretos (±15 ms); ruído branco → nenhuma nota; mesma nota repetida com ataque → duas entradas; nota fora da faixa do instrumento descartada.
- `exercise-score`: execução perfeita → 100%/100%; atraso de 200 ms no Médio → fora do tempo; nota pulada → faltou; nota trocada → errada; escala inteira uma oitava acima → certas 100% + mensagem de oitava; nota extra → contada como extra sem afetar as demais.
- Manual: professor analisa um vídeo real de guitarra, revisa e publica; aluno pratica nas 3 dificuldades no Chrome e no Firefox, com e sem fone.

## Riscos conhecidos

- Detecção em vídeos com muita fala/base gera fichas espúrias → mitigado pela revisão do professor; se ruim demais, trocar só a análise do professor por Basic Pitch (interface de `pitch.ts` permanece).
- Erros de oitava do YIN em notas graves → mitigado por não punir oitava diferente.
- A 180 BPM (333 ms por nota) a segmentação de 80 ms deixa margem, mas notas muito abafadas podem não ser detectadas.
