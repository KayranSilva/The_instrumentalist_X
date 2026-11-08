(() => {
  "use strict";

  type ExerciseData = {
    notes: string[];
    title: string;
    instrument_slug: string;
    instrument_name: string;
  };
  type Chunk = { time: number; samples: Float32Array };
  type Recorder = { stop(): void; chunks: Chunk[] };

  const stored = AppSession.requireUser();
  if (!stored) return;

  const esc = AppSession.escapeHtml;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

  const contentId = new URLSearchParams(window.location.search).get("id") || "";
  const STATUS_LABEL: Record<NoteStatus, string> = {
    ok: "certa", octave: "oitava diferente", timing: "fora do tempo", wrong: "errada", missing: "faltou",
  };
  const COUNT_IN = 4;

  let exercise: ExerciseData | null = null;
  let range: NoteRange | null = null;
  let difficulty: Difficulty = DIFFICULTIES[0];
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let scheduler: MetronomeScheduler | null = null;
  let micTimer = 0;
  let micAnalyser: AnalyserNode | null = null;
  let animation = 0;
  let running: { start: number; end: number; clickTimes: number[]; recorder: Recorder } | null = null;

  // ---------- Telas ----------
  function show(view: "setup" | "run" | "analyzing" | "report"): void {
    $("setupView").hidden = view !== "setup";
    $("runView").hidden = view !== "run";
    $("analyzingView").hidden = view !== "analyzing";
    $("reportView").hidden = view !== "report";
  }

  function unavailable(message: string): void {
    $("loadingView").hidden = true;
    $("exerciseView").hidden = true;
    $("unavailableText").textContent = message;
    $("unavailableView").hidden = false;
  }

  function chipsHtml(notes: string[]): string {
    return notes.map((note, index) => `<span class="chip" data-index="${index}">${esc(note)}</span>`).join("");
  }

  function highlight(containerId: string, index: number): void {
    $(containerId).querySelectorAll<HTMLElement>(".chip").forEach((chip) => {
      chip.classList.toggle("is-current", Number(chip.dataset.index) === index);
    });
  }

  function formatSeconds(seconds: number): string {
    return seconds < 60 ? `${Math.round(seconds)} s` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
  }

  function renderDifficulty(): void {
    $("difficulty").innerHTML = DIFFICULTIES.map((item) => (
      `<button type="button" class="segment${item.id === difficulty.id ? " active" : ""}" role="radio" aria-checked="${item.id === difficulty.id}" data-difficulty="${item.id}">`
      + `${esc(item.label)}<small>${item.bpm} BPM</small></button>`
    )).join("");
    if (exercise) {
      const seconds = (exercise.notes.length * 60) / difficulty.bpm;
      $("durationInfo").textContent = `${exercise.notes.length} notas · ${formatSeconds(seconds)} no ${difficulty.label}`;
    }
  }

  $("difficulty").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-difficulty]");
    const chosen = DIFFICULTIES.find((item) => item.id === button?.dataset.difficulty);
    if (!chosen) return;
    difficulty = chosen;
    renderDifficulty();
  });

  // ---------- Áudio e microfone ----------
  function audio(): AudioContext {
    if (!ctx) {
      ctx = Metronome.createContext();
      scheduler = new Metronome.Scheduler(ctx);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function micErrorHtml(error: unknown): string {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "<b>O acesso ao microfone foi bloqueado.</b> Para liberar:"
        + "<ol><li>Clique no ícone de cadeado (ou de microfone) ao lado do endereço do site.</li>"
        + "<li>Em <i>Microfone</i>, escolha <i>Permitir</i>.</li><li>Recarregue a página.</li></ol>";
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return "Nenhum microfone foi encontrado. Conecte um microfone (ou o fone com microfone) e tente de novo.";
    }
    if (!window.isSecureContext) {
      return "O microfone só funciona em páginas seguras (https:// ou localhost).";
    }
    return "Não foi possível abrir o microfone. Verifique se outro programa não está usando ele e tente de novo.";
  }

  async function openMic(): Promise<MediaStreamAudioSourceNode | null> {
    const context = audio();
    if (source) return source;
    $("micError").hidden = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (error) {
      $("micError").innerHTML = micErrorHtml(error);
      $("micError").hidden = false;
      return null;
    }
    source = context.createMediaStreamSource(stream);
    return source;
  }

  const WORKLET = `
    class RecorderProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.buffer = new Float32Array(4096);
        this.filled = 0;
        this.startTime = 0;
        this.active = true;
        this.port.onmessage = () => { this.flush(); this.active = false; };
      }
      flush() {
        if (!this.filled) return;
        this.port.postMessage({ time: this.startTime, samples: this.buffer.slice(0, this.filled) });
        this.filled = 0;
      }
      process(inputs) {
        const input = inputs[0];
        if (this.active && input && input.length && input[0].length) {
          const length = input[0].length;
          if (this.filled + length > this.buffer.length) this.flush();
          if (!this.filled) this.startTime = currentTime;
          for (let i = 0; i < length; i += 1) {
            let sum = 0;
            for (let c = 0; c < input.length; c += 1) sum += input[c][i];
            this.buffer[this.filled + i] = sum / input.length;
          }
          this.filled += length;
        }
        return this.active;
      }
    }
    registerProcessor("practice-recorder", RecorderProcessor);
  `;
  let workletReady: Promise<boolean> | null = null;

  function loadWorklet(context: AudioContext): Promise<boolean> {
    if (!workletReady) {
      workletReady = context.audioWorklet
        ? context.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" })))
          .then(() => true, () => false)
        : Promise.resolve(false);
    }
    return workletReady;
  }

  /** Grava o microfone em blocos com o horário (do AudioContext) da 1ª amostra. */
  async function startRecorder(context: AudioContext, input: MediaStreamAudioSourceNode): Promise<Recorder> {
    const chunks: Chunk[] = [];
    const sink = context.createGain();
    sink.gain.value = 0;
    sink.connect(context.destination);

    if (await loadWorklet(context)) {
      const node = new AudioWorkletNode(context, "practice-recorder", { numberOfOutputs: 1 });
      node.port.onmessage = (event: MessageEvent<Chunk>) => { chunks.push(event.data); };
      input.connect(node);
      node.connect(sink);
      return {
        chunks,
        stop() {
          node.port.postMessage("stop");
          window.setTimeout(() => { input.disconnect(node); node.disconnect(); sink.disconnect(); }, 200);
        },
      };
    }

    // Navegadores sem AudioWorklet: ScriptProcessor (horário aproximado).
    const processor = context.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      const data = event.inputBuffer.getChannelData(0);
      chunks.push({ time: event.playbackTime - event.inputBuffer.duration, samples: new Float32Array(data) });
    };
    input.connect(processor);
    processor.connect(sink);
    return {
      chunks,
      stop() { input.disconnect(processor); processor.disconnect(); sink.disconnect(); },
    };
  }

  /** Junta os blocos numa única gravação, posicionando cada um pelo horário. */
  function assemble(chunks: Chunk[], sampleRate: number): { start: number; samples: Float32Array } {
    if (!chunks.length) return { start: 0, samples: new Float32Array(0) };
    const start = chunks[0].time;
    const last = chunks[chunks.length - 1];
    const total = Math.round((last.time - start) * sampleRate) + last.samples.length;
    const samples = new Float32Array(total);
    chunks.forEach((chunk) => {
      const offset = Math.max(0, Math.round((chunk.time - start) * sampleRate));
      samples.set(chunk.samples.subarray(0, Math.max(0, Math.min(chunk.samples.length, total - offset))), offset);
    });
    return { start, samples };
  }

  // ---------- Teste de microfone ----------
  function stopMicTest(): void {
    window.clearInterval(micTimer);
    micTimer = 0;
    if (micAnalyser) { source?.disconnect(micAnalyser); micAnalyser = null; }
    $("micTestButton").textContent = "🎤 Testar microfone";
  }

  $("micTestButton").addEventListener("click", async () => {
    if (micTimer) { stopMicTest(); return; }
    const input = await openMic();
    if (!input || !ctx || !range) return;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    input.connect(analyser);
    micAnalyser = analyser;
    const buffer = new Float32Array(analyser.fftSize);
    const status = $("micStatus");
    let lastHeard = performance.now();
    $("micTestButton").textContent = "■ Parar teste";
    status.textContent = "Ouvindo… toque uma nota.";
    status.className = "mic-status";
    micTimer = window.setInterval(() => {
      if (!ctx || !range) return;
      analyser.getFloatTimeDomainData(buffer);
      const result = detectPitch(buffer, ctx.sampleRate, range);
      $("micMeter").style.width = `${Math.min(100, Math.round(result.rms * 400))}%`;
      if (result.midi !== null) {
        lastHeard = performance.now();
        status.textContent = `Ouvindo: ${midiToName(result.midi)} ✓`;
        status.className = "mic-status is-ok";
      } else if (performance.now() - lastHeard > 4000) {
        status.textContent = result.rms < 0.004
          ? "Não estamos captando som. Confira se o microfone certo está selecionado e aproxime o instrumento."
          : "Captando som, mas sem uma nota clara. Toque uma nota de cada vez, deixando soar.";
        status.className = "mic-status is-warn";
      }
    }, 100);
  });

  // ---------- Ouvir exemplo ----------
  let listening = 0;
  function stopListening(): void {
    window.cancelAnimationFrame(listening);
    listening = 0;
    scheduler?.stopAll();
    highlight("setupChips", -1);
    $("listenButton").textContent = "▶ Ouvir exemplo";
  }

  $("listenButton").addEventListener("click", () => {
    if (listening) { stopListening(); return; }
    if (!exercise) return;
    const context = audio();
    const start = context.currentTime + 0.15;
    const end = Metronome.playNotes(scheduler!, exercise.notes, difficulty.bpm, start);
    const beat = 60 / difficulty.bpm;
    $("listenButton").textContent = "■ Parar";
    const step = () => {
      if (context.currentTime >= end) { stopListening(); return; }
      highlight("setupChips", Math.floor((context.currentTime - start) / beat));
      listening = window.requestAnimationFrame(step);
    };
    listening = window.requestAnimationFrame(step);
  });

  // ---------- Execução ----------
  async function begin(): Promise<void> {
    if (!exercise || running) return;
    stopListening();
    stopMicTest();
    const input = await openMic();
    if (!input || !ctx || !scheduler) return;
    const context = ctx;
    const recorder = await startRecorder(context, input);

    const notes = exercise.notes;
    const beat = 60 / difficulty.bpm;
    const countStart = context.currentTime + 0.4;
    const start = countStart + COUNT_IN * beat;
    const end = start + notes.length * beat; // última nota + 1 tempo
    const clickTimes = [
      ...Metronome.clicks(scheduler, countStart, COUNT_IN, difficulty.bpm),
      ...Metronome.clicks(scheduler, start, notes.length, difficulty.bpm),
    ];
    running = { start, end, clickTimes, recorder };

    $("runChips").innerHTML = chipsHtml(notes);
    $("runInfo").textContent = `${difficulty.label} · ${difficulty.bpm} BPM · toque uma nota a cada clique`;
    show("run");
    const countdown = $("countdown");
    const step = () => {
      if (!running) return;
      const now = context.currentTime;
      if (now < start) {
        const count = Math.floor((now - countStart) / beat) + 1;
        countdown.className = "countdown";
        countdown.textContent = count >= 1 ? String(count) : "Prepare-se";
        highlight("runChips", -1);
      } else {
        countdown.className = "countdown is-playing";
        countdown.textContent = "Toque!";
        highlight("runChips", Math.min(notes.length - 1, Math.floor((now - start) / beat + 0.5)));
      }
      if (now >= end) { finish(); return; }
      animation = window.requestAnimationFrame(step);
    };
    animation = window.requestAnimationFrame(step);
  }

  async function finish(): Promise<void> {
    if (!running || !ctx || !exercise || !range) return;
    const { start, clickTimes, recorder } = running;
    const stoppedEarly = ctx.currentTime < start;
    running = null;
    window.cancelAnimationFrame(animation);
    scheduler?.stopAll();
    recorder.stop();
    if (stoppedEarly) { show("setup"); return; }

    show("analyzing");
    await new Promise((resolve) => window.setTimeout(resolve, 250)); // último bloco do gravador
    const sampleRate = ctx.sampleRate;
    const recording = assemble(recorder.chunks, sampleRate);
    const latency = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
    const detected = await detectNotesAsync(recording.samples, sampleRate, range);
    const played = detected
      .map((note) => ({ ...note, time: note.time + recording.start - latency }))
      // Clique do metrônomo vazando no microfone: curto e logo após um clique.
      .filter((note) => !(note.duration < 0.08 && clickTimes.some((click) => note.time - click >= 0 && note.time - click <= 0.04)));
    renderReport(scoreAttempt(exercise.notes, played, difficulty.bpm, start));
  }

  $("startButton").addEventListener("click", () => { begin(); });
  $("stopButton").addEventListener("click", () => { finish(); });

  // ---------- Relatório ----------
  function renderReport(report: AttemptReport): void {
    $("scoreCorrect").textContent = `${report.correctPercent}%`;
    $("scoreCorrectDetail").textContent = `${report.correct} de ${report.total} notas`;
    $("scoreOnTime").textContent = report.correct ? `${report.onTimePercent}%` : "—";
    $("scoreOnTimeDetail").textContent = report.correct ? `${report.onTime} de ${report.correct} notas certas` : "nenhuma nota certa";
    $("mainTip").textContent = report.tip;

    const notices: string[] = [];
    if (report.octaveMessage) notices.push(`<p class="notice notice--octave">🔵 ${esc(report.octaveMessage)}</p>`);
    if (report.tendencyMessage) notices.push(`<p class="notice">⏱ ${esc(report.tendencyMessage)}</p>`);
    if (report.extras) notices.push(`<p class="notice">➕ ${report.extras} ${report.extras === 1 ? "nota a mais" : "notas a mais"} do que o exercício pede.</p>`);
    report.octaveNotes.forEach((note) => notices.push(`<p class="notice notice--octave">${esc(note)}</p>`));
    $("notices").innerHTML = notices.join("");

    $("reportChips").innerHTML = report.results.map((result) => {
      const detail = result.status === "missing" ? "—"
        : result.played && result.played !== result.expected ? result.played
          : result.deviationMs !== null ? `${result.deviationMs > 0 ? "+" : ""}${result.deviationMs} ms` : "";
      return `<span class="chip chip--${result.status}" title="Nota ${result.index + 1}: ${esc(STATUS_LABEL[result.status])}">`
        + `${esc(result.expected)}<small>${esc(detail)}</small></span>`;
    }).join("");

    $("problemsBlock").hidden = !report.problems.length;
    $("problems").innerHTML = report.problems.map((problem) => `<li>${esc(problem)}</li>`).join("");
    show("report");
  }

  $("retryButton").addEventListener("click", () => { begin(); });
  $("changeButton").addEventListener("click", () => { show("setup"); });

  window.addEventListener("pagehide", () => {
    stream?.getTracks().forEach((track) => track.stop());
    ctx?.close();
  });

  // ---------- Início ----------
  async function init(): Promise<void> {
    if (!contentId) { unavailable("Nenhuma aula foi informada."); return; }
    try {
      exercise = await AppSession.api<ExerciseData>(`/content/${encodeURIComponent(contentId)}/exercise`);
    } catch (error) {
      if (error instanceof AppApiError && error.status === 401) return;
      unavailable(error instanceof Error ? error.message : "Não foi possível carregar o exercício.");
      return;
    }
    range = instrumentRange(exercise.instrument_slug);
    if (!range || !exercise.notes.length) { unavailable("Este instrumento ainda não tem prática com microfone."); return; }
    if (!window.AudioContext && !(window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) {
      unavailable("Seu navegador não suporta gravação de áudio. Use o Chrome ou o Firefox no computador.");
      return;
    }

    document.title = `The Instrumentalist — Praticar: ${exercise.title}`;
    $("exerciseTitle").textContent = exercise.title;
    $("exerciseKicker").textContent = `Praticar com microfone · ${exercise.instrument_name}`;
    $("exerciseMeta").textContent = "Toque uma nota por clique do metrônomo. No final você recebe um relatório do que acertou e do que precisa melhorar. Nada é salvo.";
    $("setupChips").innerHTML = chipsHtml(exercise.notes);
    renderDifficulty();
    $("loadingView").hidden = true;
    $("exerciseView").hidden = false;
    show("setup");
  }

  init();
})();
