(() => {
  "use strict";

  type ContentType = "aula" | "musica" | "partitura";
  type Source = "file" | "link";
  type Content = {
    id: string;
    type: ContentType;
    title: string;
    instrument: string;
    instrument_slug: string;
    description: string;
    url: string;
    teacher: string;
    teacher_id: string;
    duration: string;
    level: string;
    published: boolean;
    has_exercise?: boolean;
  };
  type Teacher = { id: string; name: string; role: string };
  type AdminUser = {
    id: string;
    display_name: string;
    email: string;
    role: "student" | "teacher" | "admin";
    xp_total: number;
    primary_instrument: string | null;
    created_at: string;
    last_sign_in_at: string | null;
  };

  const stored = AppSession.requireUser();
  if (!stored) return;
  if (!AppSession.isStaff(stored)) { window.location.replace("home.html"); return; }

  const esc = AppSession.escapeHtml;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

  const form = $<HTMLFormElement>("contentForm");
  const list = $("contentList");
  const instrumentSelect = $<HTMLSelectElement>("instrument");
  const teacherSelect = $<HTMLSelectElement>("teacher");
  const resourceInput = $<HTMLInputElement>("resource");
  const urlInput = $<HTMLInputElement>("url");
  const durationInput = $<HTMLInputElement>("duration");
  const publishedInput = $<HTMLInputElement>("published");
  const submitButton = $<HTMLButtonElement>("submitButton");

  const STORAGE_MARKER = "/storage/v1/object/public/";
  const ROLE_LABEL: Record<string, string> = { student: "Aluno", teacher: "Professor", admin: "Administrador" };
  const TYPE_LABEL: Record<ContentType, string> = { aula: "Aula", musica: "Música", partitura: "Partitura" };
  const TYPE_SYMBOL: Record<ContentType, string> = { aula: "▶", musica: "♪", partitura: "♫" };

  let me: StoredUser = stored;
  let contents: Content[] = [];
  let teachers: Teacher[] = [];
  let users: AdminUser[] = [];
  let activeFilter = "todos";
  let currentType: ContentType = "aula";
  let currentSource: Source = "file";
  let editing: Content | null = null;
  let busy = false;

  // ---------- Utilitários ----------
  let toastTimer = 0;
  function toast(message: string, kind: "success" | "error" = "success"): void {
    const element = $("toast");
    element.textContent = message;
    element.className = `toast toast--${kind}`;
    element.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { element.hidden = true; }, 4000);
  }

  function setFeedback(message: string, error = false): void {
    const feedback = $("formFeedback");
    feedback.textContent = message;
    feedback.classList.toggle("error", error);
  }

  function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function formatDate(value: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  }

  function isAdmin(): boolean { return me.role === "admin"; }

  // ---------- Navegação entre telas ----------
  function showView(): void {
    const wantsUsers = window.location.hash === "#usuarios";
    if (wantsUsers && !isAdmin()) { history.replaceState(null, "", "#conteudos"); }
    const view = wantsUsers && isAdmin() ? "users" : "content";
    $("contentView").hidden = view !== "content";
    $("usersView").hidden = view !== "users";
    document.querySelectorAll<HTMLElement>(".nav-item[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
    if (view === "users" && !users.length) loadUsers();
  }
  window.addEventListener("hashchange", showView);

  // ---------- Formulário de conteúdo ----------
  function setType(type: ContentType): void {
    currentType = type;
    document.querySelectorAll<HTMLButtonElement>(".type-option").forEach((button) => {
      const active = button.dataset.type === type;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
    $("sourceField").hidden = type === "musica";
    $("durationField").hidden = type === "partitura";
    setSource(type === "musica" ? "link" : currentSource);
  }

  function setSource(source: Source): void {
    currentSource = currentType === "musica" ? "link" : source;
    document.querySelectorAll<HTMLButtonElement>(".segment").forEach((button) => {
      const active = button.dataset.source === currentSource;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
    const isFile = currentSource === "file";
    $("resourceField").hidden = !isFile;
    $("urlField").hidden = isFile;
    updateExerciseBox();

    const keepNote = editing ? " Deixe vazio para manter o arquivo atual." : "";
    if (currentType === "partitura") {
      $("resourceLabel").innerHTML = `Arquivo PDF da partitura${editing ? "" : " <i>*</i>"}`;
      resourceInput.accept = ".pdf,application/pdf";
      $("resourceHint").textContent = `Somente PDF.${keepNote}`;
      $("urlLabel").innerHTML = "Link do PDF <i>*</i>";
      urlInput.placeholder = "https://…/partitura.pdf";
      $("urlHint").textContent = "Link direto para o PDF.";
    } else if (currentType === "aula") {
      $("resourceLabel").innerHTML = `Vídeo ou áudio da aula${editing ? "" : " <i>*</i>"}`;
      resourceInput.accept = "video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/ogg,.mp4,.webm,.mov,.mp3,.wav,.ogg";
      $("resourceHint").textContent = `MP4, WEBM, MOV, MP3, WAV ou OGG.${keepNote}`;
      $("urlLabel").innerHTML = "Link do vídeo <i>*</i>";
      urlInput.placeholder = "https://www.youtube.com/watch?v=…";
      $("urlHint").textContent = "YouTube, Vimeo ou link direto para o arquivo.";
    } else {
      $("urlLabel").innerHTML = "Link da música <i>*</i>";
      urlInput.placeholder = "https://open.spotify.com/… ou https://youtube.com/…";
      $("urlHint").textContent = "Spotify, YouTube, SoundCloud ou outro link público.";
    }
    updateSubmitLabel();
  }

  function updateSubmitLabel(): void {
    $("submitLabel").textContent = editing
      ? "Salvar alterações"
      : publishedInput.checked ? "Publicar conteúdo" : "Salvar rascunho";
  }

  function fillTeacherSelect(selectedId?: string): void {
    const current = selectedId ?? teacherSelect.value;
    teacherSelect.innerHTML = '<option value="">Selecione</option>'
      + teachers.map((teacher) => `<option value="${esc(teacher.id)}">${esc(teacher.name)}${teacher.id === me.id ? " (você)" : ""}</option>`).join("");
    const fallback = teachers.some((teacher) => teacher.id === me.id) ? me.id || "" : "";
    teacherSelect.value = teachers.some((teacher) => teacher.id === current) ? current : fallback;
  }

  function resetForm(): void {
    editing = null;
    form.reset();
    publishedInput.checked = true;
    $("formEyebrow").textContent = "Novo conteúdo";
    $("formTitle").textContent = "Publicar item";
    $("cancelEdit").hidden = true;
    $("typeSwitch").classList.remove("is-locked");
    document.querySelectorAll<HTMLButtonElement>(".type-option").forEach((button) => { button.disabled = false; });
    fillTeacherSelect(me.id);
    currentSource = "file";
    resetExercise();
    setType("aula");
  }

  function startEdit(item: Content): void {
    editing = item;
    form.reset();
    ($("title") as HTMLInputElement).value = item.title;
    instrumentSelect.value = item.instrument_slug;
    ($("level") as HTMLSelectElement).value = item.level;
    ($("description") as HTMLTextAreaElement).value = item.description;
    durationInput.value = item.duration;
    publishedInput.checked = item.published;
    fillTeacherSelect(item.teacher_id);

    const isStoredFile = item.url.includes(STORAGE_MARKER);
    urlInput.value = isStoredFile ? "" : item.url;
    currentSource = isStoredFile ? "file" : "link";
    setType(item.type);
    document.querySelectorAll<HTMLButtonElement>(".type-option").forEach((button) => { button.disabled = button.dataset.type !== item.type; });
    $("typeSwitch").classList.add("is-locked");

    $("formEyebrow").textContent = "Editando";
    $("formTitle").textContent = "Editar item";
    $("cancelEdit").hidden = false;
    setFeedback("");
    resetExercise();
    loadExercise(item);
    $("publishPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    ($("title") as HTMLInputElement).focus({ preventScroll: true });
  }

  function validate(): string | null {
    const title = ($("title") as HTMLInputElement).value.trim();
    if (!title) return "Informe o título.";
    if (!instrumentSelect.value) return "Escolha o instrumento.";
    if (!teacherSelect.value) return "Escolha o professor responsável.";
    if (currentSource === "file" && !resourceInput.files?.length && !editing) return "Selecione o arquivo para enviar.";
    if (currentSource === "file" && editing && !resourceInput.files?.length && !editing.url.includes(STORAGE_MARKER)) {
      return "Selecione o arquivo para enviar.";
    }
    if (currentSource === "link" && !/^https?:\/\/\S+$/i.test(urlInput.value.trim())) return "Informe um link válido começando com https://";
    if (currentType !== "partitura" && durationInput.value.trim() && !/^\d{1,3}(:[0-5]\d){1,2}$/.test(durationInput.value.trim())) {
      return "Duração inválida. Use mm:ss (ex.: 12:40).";
    }
    return exerciseProblem();
  }

  function setProgress(percent: number | null): void {
    const wrap = $("uploadProgress");
    wrap.hidden = percent === null;
    if (percent === null) return;
    $("uploadProgressBar").style.width = `${percent}%`;
    $("uploadProgressLabel").textContent = percent < 100 ? `Enviando… ${percent}%` : "Processando…";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    setFeedback("");
    const problem = validate();
    if (problem) { setFeedback(problem, true); return; }

    const payload = new FormData();
    payload.set("type", currentType);
    payload.set("title", ($("title") as HTMLInputElement).value.trim());
    payload.set("instrument", instrumentSelect.value);
    payload.set("level", ($("level") as HTMLSelectElement).value);
    payload.set("description", ($("description") as HTMLTextAreaElement).value.trim());
    payload.set("teacher_id", teacherSelect.value);
    payload.set("duration", currentType === "partitura" ? "" : durationInput.value.trim());
    payload.set("published", publishedInput.checked ? "true" : "false");
    if (currentSource === "link") payload.set("url", urlInput.value.trim());
    const file = currentSource === "file" ? resourceInput.files?.[0] : undefined;
    if (file) payload.set("resource", file, file.name);

    busy = true;
    submitButton.disabled = true;
    setProgress(file ? 0 : null);
    try {
      const path = editing ? `/admin/content/${encodeURIComponent(editing.id)}` : "/admin/content";
      const result = await AppSession.upload<{ message: string; id?: string }>(path, editing ? "PATCH" : "POST", payload, file ? setProgress : undefined);
      const savedId = editing ? editing.id : result.id;
      let exerciseError = "";
      if (savedId && currentType === "aula") {
        try {
          await syncExercise(savedId, Boolean(editing?.has_exercise), Boolean(file));
        } catch (error) {
          exerciseError = errorMessage(error, "Não foi possível salvar o gabarito.");
        }
      }
      if (exerciseError) {
        toast(`Aula salva, mas o gabarito não: ${exerciseError} Clique em Editar na aula para tentar de novo.`, "error");
      } else {
        toast(result.message || "Salvo.");
      }
      resetForm();
      await loadContents();
    } catch (error) {
      setFeedback(errorMessage(error, "Não foi possível salvar."), true);
    } finally {
      busy = false;
      submitButton.disabled = false;
      setProgress(null);
    }
  });

  document.querySelectorAll<HTMLButtonElement>(".type-option").forEach((button) => button.addEventListener("click", () => {
    if (editing) return;
    setType((button.dataset.type as ContentType) || "aula");
  }));
  document.querySelectorAll<HTMLButtonElement>(".segment").forEach((button) => button.addEventListener("click", () => {
    setSource((button.dataset.source as Source) || "file");
  }));
  publishedInput.addEventListener("change", updateSubmitLabel);
  $("cancelEdit").addEventListener("click", () => { resetForm(); setFeedback(""); });

  // ---------- Exercício com reconhecimento de áudio ----------
  type ExerciseNote = { note: string; time: number | null };
  type SavedExercise = { notes: string[]; reference_url: string | null };

  const exerciseEnabled = $<HTMLInputElement>("exerciseEnabled");
  const referenceFile = $<HTMLInputElement>("referenceFile");
  const notesText = $<HTMLInputElement>("notesText");
  let exerciseNotes: ExerciseNote[] = [];
  let selectedNote = -1;
  let savedExercise: SavedExercise | null = null;
  let unsavedExercise: { id: string; notes: string[] } | null = null;
  let exerciseLoad = 0;
  let analyzing = false;
  let previewUrl = "";
  let listenCtx: AudioContext | null = null;
  let listenScheduler: MetronomeScheduler | null = null;
  let listenTimer = 0;

  function currentRange(): NoteRange | null {
    return instrumentRange(instrumentSelect.value);
  }

  function exerciseActive(): boolean {
    return currentType === "aula" && Boolean(currentRange()) && exerciseEnabled.checked;
  }

  function formatTime(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
  }

  function updateExerciseBox(): void {
    $("exerciseBox").hidden = !(currentType === "aula" && currentRange());
    $("exerciseBody").hidden = !exerciseEnabled.checked;
    const isLink = currentSource === "link";
    $("referenceField").hidden = !isLink;
    $("referenceInfo").hidden = isLink;
    $("referenceInfo").textContent = "As notas serão sugeridas a partir do arquivo da aula (selecionado acima). Revise antes de salvar.";
    const hasSavedReference = Boolean(savedExercise?.reference_url);
    $("referenceLabel").innerHTML = `Áudio de referência${hasSavedReference ? "" : " <i>*</i>"}`;
    $("referenceHint").textContent = hasSavedReference
      ? "A aula usa link. Deixe vazio para manter o áudio de referência atual."
      : "A aula usa link: envie um áudio curto com o exercício tocado.";
  }

  function renderNotes(): void {
    const range = currentRange();
    const chips = exerciseNotes.map((item, index) => {
      const time = item.time === null ? "" : `<small>${formatTime(item.time)}</small>`;
      return `<button type="button" class="note-insert" data-insert="${index}" title="Inserir nota aqui" aria-label="Inserir nota antes da nota ${index + 1}">+</button>`
        + `<span class="note-chip${index === selectedNote ? " is-selected" : ""}">`
        + `<button type="button" class="note-chip-main" data-select="${index}" title="Nota ${index + 1}: clique para trocar">${esc(item.note)}${time}</button>`
        + `<button type="button" class="note-chip-remove" data-remove="${index}" aria-label="Remover nota ${index + 1}">×</button></span>`;
    }).join("");
    $("noteChips").innerHTML = chips
      + `<button type="button" class="note-insert note-insert--end" data-insert="${exerciseNotes.length}">+ nota</button>`;

    const count = exerciseNotes.length;
    const seconds = (bpm: number) => String(Math.round(((count * 60) / bpm) * 10) / 10).replace(".", ",");
    $("notesCounter").textContent = count
      ? `${count} ${count === 1 ? "nota" : "notas"} · ${seconds(DIFFICULTIES[0].bpm)} s no Fácil / ${seconds(DIFFICULTIES[2].bpm)} s no Difícil`
      : "Nenhuma nota no gabarito ainda. Analise o áudio ou digite as notas.";
    if (document.activeElement !== notesText) notesText.value = exerciseNotes.map((item) => item.note).join(" ");
    ($("exerciseListen") as HTMLButtonElement).disabled = !count;

    const editor = $("noteEditor");
    editor.hidden = selectedNote < 0 || selectedNote >= count || !range;
    if (editor.hidden || !range) return;
    const midi = nameToMidi(exerciseNotes[selectedNote].note) ?? range.min;
    $("noteEditorIndex").textContent = String(selectedNote + 1);
    const nameSelect = $<HTMLSelectElement>("noteName");
    const octaveSelect = $<HTMLSelectElement>("noteOctave");
    nameSelect.innerHTML = NOTE_NAMES.map((name) => `<option value="${name}">${name}</option>`).join("");
    const octaves: number[] = [];
    for (let octave = Math.floor(range.min / 12) - 1; octave <= Math.floor(range.max / 12) - 1; octave += 1) octaves.push(octave);
    octaveSelect.innerHTML = octaves.map((octave) => `<option value="${octave}">${octave}</option>`).join("");
    nameSelect.value = NOTE_NAMES[midi % 12];
    octaveSelect.value = String(Math.floor(midi / 12) - 1);
  }

  function changeSelectedNote(): void {
    const range = currentRange();
    if (!range || selectedNote < 0) return;
    const name = $<HTMLSelectElement>("noteName").value;
    const octave = Number($<HTMLSelectElement>("noteOctave").value);
    const midi = Math.min(range.max, Math.max(range.min, (octave + 1) * 12 + NOTE_NAMES.indexOf(name)));
    exerciseNotes[selectedNote].note = midiToName(midi);
    renderNotes();
  }
  $("noteName").addEventListener("change", changeSelectedNote);
  $("noteOctave").addEventListener("change", changeSelectedNote);
  $("noteDone").addEventListener("click", () => { selectedNote = -1; renderNotes(); });

  $("noteChips").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const remove = target.closest<HTMLElement>("[data-remove]");
    const insert = target.closest<HTMLElement>("[data-insert]");
    const select = target.closest<HTMLElement>("[data-select]");
    if (remove) {
      const index = Number(remove.dataset.remove);
      exerciseNotes.splice(index, 1);
      if (selectedNote === index) selectedNote = -1;
      else if (selectedNote > index) selectedNote -= 1;
    } else if (insert) {
      const index = Number(insert.dataset.insert);
      const neighbor = exerciseNotes[index - 1] || exerciseNotes[index];
      const range = currentRange();
      const fallback = range ? midiToName(Math.min(range.max, Math.max(range.min, 60))) : "C4";
      exerciseNotes.splice(index, 0, { note: neighbor ? neighbor.note : fallback, time: null });
      selectedNote = index;
    } else if (select) {
      const index = Number(select.dataset.select);
      selectedNote = selectedNote === index ? -1 : index;
      const time = exerciseNotes[index]?.time;
      const media = $("exercisePreview").querySelector<HTMLMediaElement>("video, audio");
      if (media && time !== null && time !== undefined) { media.currentTime = Math.max(0, time - 0.2); media.play().catch(() => undefined); }
    } else {
      return;
    }
    renderNotes();
  });

  function applyNotesText(): boolean {
    const tokens = notesText.value.trim().split(/[\s,;]+/).filter(Boolean).map((token) => token.charAt(0).toUpperCase() + token.slice(1));
    const invalid = tokens.find((token) => nameToMidi(token) === null);
    if (invalid) { setFeedback(`Nota inválida: "${invalid}". Use o formato C4, F#3…`, true); return false; }
    if (tokens.length > 200) { setFeedback("O gabarito pode ter no máximo 200 notas.", true); return false; }
    if (tokens.join(" ") !== exerciseNotes.map((item) => item.note).join(" ")) {
      exerciseNotes = tokens.map((note) => ({ note, time: null }));
      selectedNote = -1;
    }
    setFeedback("");
    renderNotes();
    return true;
  }
  notesText.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); applyNotesText(); }
  });
  notesText.addEventListener("change", () => { applyNotesText(); });

  function setAnalyzeProgress(fraction: number | null, label = "Analisando"): void {
    $("analyzeProgress").hidden = fraction === null;
    if (fraction === null) return;
    $("analyzeProgressBar").style.width = `${Math.round(fraction * 100)}%`;
    $("analyzeProgressLabel").textContent = `${label}… ${Math.round(fraction * 100)}%`;
  }

  function showPreview(url: string, isVideo: boolean): void {
    const box = $("exercisePreview");
    const media = document.createElement(isVideo ? "video" : "audio");
    media.controls = true;
    media.preload = "metadata";
    media.src = url;
    box.replaceChildren(media);
    box.hidden = false;
  }

  function clearPreview(): void {
    $("exercisePreview").replaceChildren();
    $("exercisePreview").hidden = true;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
  }

  /** Arquivo a analisar: o da aula (novo ou já enviado) ou o áudio de referência. */
  async function referenceSource(): Promise<{ data: ArrayBuffer; url: string; isVideo: boolean }> {
    const isVideoName = (name: string) => /\.(mp4|webm|mov)(\?|$)/i.test(name);
    const local = currentSource === "file" ? resourceInput.files?.[0] : referenceFile.files?.[0];
    if (local) {
      clearPreview();
      previewUrl = URL.createObjectURL(local);
      return { data: await local.arrayBuffer(), url: previewUrl, isVideo: local.type.startsWith("video/") || isVideoName(local.name) };
    }
    const remote = currentSource === "file"
      ? (editing && editing.url.includes(STORAGE_MARKER) ? editing.url : "")
      : savedExercise?.reference_url || "";
    if (!remote) {
      throw new Error(currentSource === "file" ? "Selecione o arquivo da aula antes de analisar." : "Envie o áudio de referência antes de analisar.");
    }
    setAnalyzeProgress(0, "Baixando o áudio");
    const response = await fetch(remote);
    if (!response.ok) throw new Error("Não foi possível baixar o arquivo da aula para análise.");
    return { data: await response.arrayBuffer(), url: remote, isVideo: isVideoName(remote) };
  }

  $("analyzeButton").addEventListener("click", async () => {
    const range = currentRange();
    if (analyzing || !range) return;
    if (exerciseNotes.length && !window.confirm("Substituir o gabarito atual pelas notas detectadas no áudio?")) return;
    analyzing = true;
    ($("analyzeButton") as HTMLButtonElement).disabled = true;
    setFeedback("");
    try {
      const source = await referenceSource();
      setAnalyzeProgress(0, "Decodificando");
      const decoder = new OfflineAudioContext(1, 1, 44100);
      let buffer: AudioBuffer;
      try {
        buffer = await decoder.decodeAudioData(source.data);
      } catch {
        throw new Error("Não foi possível ler o áudio deste arquivo. Tente um MP3, WAV ou MP4.");
      }
      const channels: Float32Array[] = [];
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) channels.push(buffer.getChannelData(channel));
      const detected = await detectNotesAsync(mixToMono(channels), buffer.sampleRate, range, (fraction) => setAnalyzeProgress(fraction));
      if (!detected.length) throw new Error("Nenhuma nota foi reconhecida no áudio. Confira o instrumento escolhido ou digite as notas.");
      exerciseNotes = detected.slice(0, 200).map((note) => ({ note: note.note, time: note.time }));
      selectedNote = -1;
      showPreview(source.url, source.isVideo);
      renderNotes();
      setFeedback(`${exerciseNotes.length} notas sugeridas${detected.length > 200 ? " (limite de 200)" : ""}. Revise o gabarito antes de salvar.`);
    } catch (error) {
      setFeedback(errorMessage(error, "Não foi possível analisar o áudio."), true);
    } finally {
      analyzing = false;
      ($("analyzeButton") as HTMLButtonElement).disabled = false;
      setAnalyzeProgress(null);
    }
  });

  function stopListening(): void {
    window.clearTimeout(listenTimer);
    listenTimer = 0;
    listenScheduler?.stopAll();
    $("exerciseListen").textContent = "▶ Ouvir";
  }

  $("exerciseListen").addEventListener("click", () => {
    if (listenTimer) { stopListening(); return; }
    if (!exerciseNotes.length) return;
    if (!listenCtx) { listenCtx = Metronome.createContext(); listenScheduler = new Metronome.Scheduler(listenCtx); }
    if (listenCtx.state === "suspended") listenCtx.resume();
    const end = Metronome.playNotes(listenScheduler!, exerciseNotes.map((item) => item.note), DIFFICULTIES[0].bpm);
    $("exerciseListen").textContent = "■ Parar";
    listenTimer = window.setTimeout(stopListening, (end - listenCtx.currentTime) * 1000 + 200);
  });

  exerciseEnabled.addEventListener("change", () => { updateExerciseBox(); renderNotes(); });
  instrumentSelect.addEventListener("change", () => { updateExerciseBox(); renderNotes(); });

  function resetExercise(): void {
    exerciseLoad += 1;
    stopListening();
    clearPreview();
    exerciseEnabled.checked = false;
    exerciseNotes = [];
    selectedNote = -1;
    savedExercise = null;
    referenceFile.value = "";
    notesText.value = "";
    updateExerciseBox();
    renderNotes();
  }

  async function loadExercise(item: Content): Promise<void> {
    const load = ++exerciseLoad;
    if (unsavedExercise?.id === item.id) {
      exerciseEnabled.checked = true;
      exerciseNotes = unsavedExercise.notes.map((note) => ({ note, time: null }));
    }
    if (item.has_exercise) {
      exerciseEnabled.checked = true;
      try {
        const data = await AppSession.api<SavedExercise>(`/content/${encodeURIComponent(item.id)}/exercise`);
        if (load !== exerciseLoad) return;
        savedExercise = data;
        if (unsavedExercise?.id !== item.id) exerciseNotes = (data.notes || []).map((note) => ({ note, time: null }));
      } catch (error) {
        if (load === exerciseLoad) setFeedback(errorMessage(error, "Não foi possível carregar o gabarito."), true);
      }
    }
    if (load !== exerciseLoad) return;
    updateExerciseBox();
    renderNotes();
  }

  function exerciseProblem(): string | null {
    if (!exerciseActive()) return null;
    if (!applyNotesText()) return $("formFeedback").textContent || "Corrija as notas do gabarito.";
    if (!exerciseNotes.length) return "O exercício está marcado, mas o gabarito está vazio. Analise o áudio ou digite as notas.";
    if (currentSource === "link" && !referenceFile.files?.length && !savedExercise?.reference_url) {
      return "A aula usa link: envie o áudio de referência do exercício.";
    }
    return null;
  }

  /** Grava (PUT) ou remove (DELETE) o gabarito depois que a aula foi salva. */
  async function syncExercise(contentId: string, hadExercise: boolean, mainFileChanged: boolean): Promise<void> {
    if (!exerciseActive()) {
      if (hadExercise) await AppSession.api(`/admin/content/${encodeURIComponent(contentId)}/exercise`, { method: "DELETE" });
      return;
    }
    const body = new FormData();
    const notes = exerciseNotes.map((item) => item.note);
    body.set("notes", JSON.stringify(notes));
    const reference = currentSource === "link" ? referenceFile.files?.[0] : undefined;
    if (reference) {
      body.set("reference", "upload");
      body.set("resource", reference, reference.name);
    } else {
      body.set("reference", currentSource === "file" && (mainFileChanged || !savedExercise) ? "main" : "keep");
    }
    try {
      await AppSession.upload(`/admin/content/${encodeURIComponent(contentId)}/exercise`, "PUT", body);
      unsavedExercise = null;
    } catch (error) {
      unsavedExercise = { id: contentId, notes };
      throw error;
    }
  }

  // ---------- Catálogo ----------
  function renderList(): void {
    const query = ($("contentSearch") as HTMLInputElement).value.trim().toLowerCase();
    const visible = contents.filter((item) => {
      if (activeFilter === "rascunho" ? item.published : activeFilter !== "todos" && item.type !== activeFilter) return false;
      if (!query) return true;
      return [item.title, item.instrument, item.teacher].some((value) => value.toLowerCase().includes(query));
    });
    $("visibleCount").textContent = `${visible.length} ${visible.length === 1 ? "item" : "itens"}`;
    if (!visible.length) {
      list.innerHTML = `<div class="empty-state"><span>♪</span><p>${contents.length ? "Nenhum conteúdo encontrado." : "Nenhum conteúdo publicado ainda. Use o formulário ao lado para criar o primeiro."}</p></div>`;
      return;
    }
    list.innerHTML = visible.map((item) => {
      const meta = [TYPE_LABEL[item.type], item.instrument, item.level, item.teacher].filter(Boolean).map(esc).join(" · ");
      const link = /^https?:\/\//i.test(item.url)
        ? `<a class="content-link" href="${esc(item.url)}" target="_blank" rel="noopener">Abrir ↗</a>` : "";
      return `<article class="content-item${editing?.id === item.id ? " is-editing" : ""}">`
        + `<span class="content-symbol ${item.type}" aria-hidden="true">${TYPE_SYMBOL[item.type]}</span>`
        + `<div class="content-body"><h3 class="content-title">${esc(item.title)}${item.published ? "" : ' <span class="draft-pill">Rascunho</span>'}${item.has_exercise ? ' <span class="exercise-pill" title="Tem exercício com reconhecimento de áudio">🎤 Exercício</span>' : ""}</h3>`
        + `<p class="content-meta">${meta}</p></div>`
        + `<div class="content-actions">${link}`
        + `<button class="text-button" type="button" data-edit="${esc(item.id)}">Editar</button>`
        + `<button class="delete-button" type="button" data-delete="${esc(item.id)}" aria-label="Excluir ${esc(item.title)}" title="Excluir">×</button></div>`
        + `</article>`;
    }).join("");
  }

  async function loadContents(): Promise<void> {
    try {
      const data = await AppSession.api<{ content: Content[] }>("/admin/content");
      contents = data.content || [];
      const published = contents.filter((item) => item.published);
      const drafts = contents.length - published.length;
      $("totalCount").textContent = String(published.length);
      $("draftNote").textContent = drafts ? `+ ${drafts} ${drafts === 1 ? "rascunho" : "rascunhos"}` : "visíveis para os alunos";
      $("lessonCount").textContent = String(contents.filter((item) => item.type === "aula").length);
      $("materialCount").textContent = String(contents.filter((item) => item.type !== "aula").length);
      renderList();
    } catch (error) {
      list.innerHTML = `<div class="empty-state"><span>!</span><p>${esc(errorMessage(error, "Não foi possível carregar o catálogo."))}</p></div>`;
    }
  }

  list.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const editButton = target.closest<HTMLButtonElement>("[data-edit]");
    if (editButton) {
      const item = contents.find((content) => content.id === editButton.dataset.edit);
      if (item) { startEdit(item); renderList(); }
      return;
    }
    const deleteButton = target.closest<HTMLButtonElement>("[data-delete]");
    if (!deleteButton) return;
    const item = contents.find((content) => content.id === deleteButton.dataset.delete);
    if (!item || !window.confirm(`Excluir "${item.title}"? O arquivo enviado também será apagado. Essa ação não pode ser desfeita.`)) return;
    deleteButton.disabled = true;
    try {
      await AppSession.api(`/admin/content/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (editing?.id === item.id) resetForm();
      toast("Conteúdo excluído.");
      await loadContents();
    } catch (error) {
      deleteButton.disabled = false;
      toast(errorMessage(error, "Não foi possível excluir."), "error");
    }
  });

  document.querySelectorAll<HTMLButtonElement>(".filter-button").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".filter-button").forEach((item) => item.classList.toggle("active", item === button));
    activeFilter = button.dataset.filter || "todos";
    renderList();
  }));
  $("contentSearch").addEventListener("input", renderList);
  $("refreshBtn").addEventListener("click", () => { loadContents(); });

  async function loadInstruments(): Promise<void> {
    const instruments = (await AppSession.loadInstruments()).slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const current = instrumentSelect.value;
    instrumentSelect.innerHTML = '<option value="">Selecione</option>'
      + instruments.map((item) => `<option value="${esc(item.slug)}">${esc(item.name)}</option>`).join("");
    if (current) instrumentSelect.value = current;
  }

  async function loadTeachers(): Promise<void> {
    try {
      const data = await AppSession.api<{ teachers: Teacher[] }>("/admin/teachers");
      teachers = data.teachers || [];
    } catch {
      teachers = me.id ? [{ id: me.id, name: me.name || me.email, role: me.role || "teacher" }] : [];
    }
    fillTeacherSelect(editing?.teacher_id || me.id);
  }

  // ---------- Usuários ----------
  function renderUsers(): void {
    const query = ($("userSearch") as HTMLInputElement).value.trim().toLowerCase();
    const visible = users.filter((user) => !query || `${user.display_name} ${user.email}`.toLowerCase().includes(query));
    $("studentCount").textContent = String(users.filter((user) => user.role === "student").length);
    $("teacherCount").textContent = String(users.filter((user) => user.role === "teacher").length);
    $("adminCount").textContent = String(users.filter((user) => user.role === "admin").length);
    $("userVisibleCount").textContent = `${visible.length} ${visible.length === 1 ? "usuário" : "usuários"}`;

    const body = $("usersBody");
    if (!visible.length) {
      body.innerHTML = `<tr><td colspan="6" class="table-empty">${users.length ? "Nenhum usuário encontrado." : "Nenhum usuário cadastrado."}</td></tr>`;
      return;
    }
    body.innerHTML = visible.map((user) => {
      const isMe = user.id === me.id;
      const options = Object.keys(ROLE_LABEL)
        .map((role) => `<option value="${role}"${role === user.role ? " selected" : ""}>${ROLE_LABEL[role]}</option>`).join("");
      return `<tr>`
        + `<td data-label="Usuário"><div class="user-cell"><span class="user-avatar" aria-hidden="true">${esc(AppSession.initial(user.display_name || user.email))}</span>`
        + `<span><b>${esc(user.display_name || "Sem nome")}${isMe ? " (você)" : ""}</b><small>${esc(user.email)}</small></span></div></td>`
        + `<td data-label="Instrumento">${esc(user.primary_instrument || "—")}</td>`
        + `<td data-label="XP">${Number(user.xp_total || 0).toLocaleString("pt-BR")}</td>`
        + `<td data-label="Cadastro">${esc(formatDate(user.created_at))}</td>`
        + `<td data-label="Último acesso">${esc(formatDate(user.last_sign_in_at))}</td>`
        + `<td data-label="Papel"><select class="role-select" data-user="${esc(user.id)}" aria-label="Papel de ${esc(user.display_name)}"${isMe ? ' disabled title="Você não pode alterar o seu próprio papel."' : ""}>${options}</select></td>`
        + `</tr>`;
    }).join("");
  }

  async function loadUsers(): Promise<void> {
    if (!isAdmin()) return;
    try {
      const data = await AppSession.api<{ users: AdminUser[] }>("/admin/users");
      users = data.users || [];
      renderUsers();
    } catch (error) {
      $("usersBody").innerHTML = `<tr><td colspan="6" class="table-empty">${esc(errorMessage(error, "Não foi possível carregar os usuários."))}</td></tr>`;
    }
  }

  $("usersBody").addEventListener("change", async (event) => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>(".role-select");
    if (!select?.dataset.user) return;
    const user = users.find((item) => item.id === select.dataset.user);
    if (!user) return;
    const role = select.value as AdminUser["role"];
    const warning = role === "admin"
      ? `Tornar ${user.display_name} administrador? Essa pessoa terá acesso total, inclusive para gerenciar usuários.`
      : `Alterar o papel de ${user.display_name} para ${ROLE_LABEL[role]}?`;
    if (!window.confirm(warning)) { select.value = user.role; return; }
    select.disabled = true;
    try {
      await AppSession.api(`/admin/users/${encodeURIComponent(user.id)}/role`, { method: "POST", json: { role } });
      user.role = role;
      toast(`${user.display_name} agora é ${ROLE_LABEL[role].toLowerCase()}.`);
      renderUsers();
      loadTeachers();
    } catch (error) {
      select.value = user.role;
      toast(errorMessage(error, "Não foi possível alterar o papel."), "error");
    } finally {
      select.disabled = false;
    }
  });
  $("userSearch").addEventListener("input", renderUsers);
  $("refreshUsersBtn").addEventListener("click", () => { loadUsers(); });

  // ---------- Sessão ----------
  function renderIdentity(): void {
    $("adminIdentity").textContent = me.name || me.email;
    $("adminRole").textContent = ROLE_LABEL[me.role || ""] || "";
    $("navUsers").hidden = !isAdmin();
  }

  $("logoutButton").addEventListener("click", () => { AppSession.logout(); });

  async function init(): Promise<void> {
    renderIdentity();
    try {
      // O papel salvo no navegador pode estar desatualizado: confirma no servidor.
      const data = await AppSession.api<{ user: StoredUser }>("/me");
      me = { ...stored!, ...data.user };
      AppSession.saveUser(me);
      if (!AppSession.isStaff(me)) { window.location.replace("home.html"); return; }
    } catch (error) {
      if (error instanceof AppApiError && error.status === 401) return;
    }
    renderIdentity();
    showView();
    resetForm();
    await Promise.all([loadInstruments(), loadTeachers()]);
    await loadContents();
  }

  init();
})();
