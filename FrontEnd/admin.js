"use strict";
(() => {
    "use strict";
    const stored = AppSession.requireUser();
    if (!stored)
        return;
    if (!AppSession.isStaff(stored)) {
        window.location.replace("home.html");
        return;
    }
    const esc = AppSession.escapeHtml;
    const $ = (id) => document.getElementById(id);
    const form = $("contentForm");
    const list = $("contentList");
    const instrumentSelect = $("instrument");
    const teacherSelect = $("teacher");
    const resourceInput = $("resource");
    const urlInput = $("url");
    const durationInput = $("duration");
    const publishedInput = $("published");
    const submitButton = $("submitButton");
    const STORAGE_MARKER = "/storage/v1/object/public/";
    const ROLE_LABEL = { student: "Aluno", teacher: "Professor", admin: "Administrador" };
    const TYPE_LABEL = { aula: "Aula", musica: "Música", partitura: "Partitura" };
    const TYPE_SYMBOL = { aula: "▶", musica: "♪", partitura: "♫" };
    let me = stored;
    let contents = [];
    let teachers = [];
    let users = [];
    let activeFilter = "todos";
    let currentType = "aula";
    let currentSource = "file";
    let editing = null;
    let busy = false;
    // ---------- Utilitários ----------
    let toastTimer = 0;
    function toast(message, kind = "success") {
        const element = $("toast");
        element.textContent = message;
        element.className = `toast toast--${kind}`;
        element.hidden = false;
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => { element.hidden = true; }, 4000);
    }
    function setFeedback(message, error = false) {
        const feedback = $("formFeedback");
        feedback.textContent = message;
        feedback.classList.toggle("error", error);
    }
    function errorMessage(error, fallback) {
        return error instanceof Error ? error.message : fallback;
    }
    function formatDate(value) {
        if (!value)
            return "—";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    }
    function isAdmin() { return me.role === "admin"; }
    // ---------- Navegação entre telas ----------
    function showView() {
        const wantsUsers = window.location.hash === "#usuarios";
        if (wantsUsers && !isAdmin()) {
            history.replaceState(null, "", "#conteudos");
        }
        const view = wantsUsers && isAdmin() ? "users" : "content";
        $("contentView").hidden = view !== "content";
        $("usersView").hidden = view !== "users";
        document.querySelectorAll(".nav-item[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
        if (view === "users" && !users.length)
            loadUsers();
    }
    window.addEventListener("hashchange", showView);
    // ---------- Formulário de conteúdo ----------
    function setType(type) {
        currentType = type;
        document.querySelectorAll(".type-option").forEach((button) => {
            const active = button.dataset.type === type;
            button.classList.toggle("active", active);
            button.setAttribute("aria-checked", String(active));
        });
        $("sourceField").hidden = type === "musica";
        $("durationField").hidden = type === "partitura";
        setSource(type === "musica" ? "link" : currentSource);
    }
    function setSource(source) {
        currentSource = currentType === "musica" ? "link" : source;
        document.querySelectorAll(".segment").forEach((button) => {
            const active = button.dataset.source === currentSource;
            button.classList.toggle("active", active);
            button.setAttribute("aria-checked", String(active));
        });
        const isFile = currentSource === "file";
        $("resourceField").hidden = !isFile;
        $("urlField").hidden = isFile;
        const keepNote = editing ? " Deixe vazio para manter o arquivo atual." : "";
        if (currentType === "partitura") {
            $("resourceLabel").innerHTML = `Arquivo PDF da partitura${editing ? "" : " <i>*</i>"}`;
            resourceInput.accept = ".pdf,application/pdf";
            $("resourceHint").textContent = `Somente PDF.${keepNote}`;
            $("urlLabel").innerHTML = "Link do PDF <i>*</i>";
            urlInput.placeholder = "https://…/partitura.pdf";
            $("urlHint").textContent = "Link direto para o PDF.";
        }
        else if (currentType === "aula") {
            $("resourceLabel").innerHTML = `Vídeo ou áudio da aula${editing ? "" : " <i>*</i>"}`;
            resourceInput.accept = "video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/ogg,.mp4,.webm,.mov,.mp3,.wav,.ogg";
            $("resourceHint").textContent = `MP4, WEBM, MOV, MP3, WAV ou OGG.${keepNote}`;
            $("urlLabel").innerHTML = "Link do vídeo <i>*</i>";
            urlInput.placeholder = "https://www.youtube.com/watch?v=…";
            $("urlHint").textContent = "YouTube, Vimeo ou link direto para o arquivo.";
        }
        else {
            $("urlLabel").innerHTML = "Link da música <i>*</i>";
            urlInput.placeholder = "https://open.spotify.com/… ou https://youtube.com/…";
            $("urlHint").textContent = "Spotify, YouTube, SoundCloud ou outro link público.";
        }
        updateSubmitLabel();
    }
    function updateSubmitLabel() {
        $("submitLabel").textContent = editing
            ? "Salvar alterações"
            : publishedInput.checked ? "Publicar conteúdo" : "Salvar rascunho";
    }
    function fillTeacherSelect(selectedId) {
        const current = selectedId !== null && selectedId !== void 0 ? selectedId : teacherSelect.value;
        teacherSelect.innerHTML = '<option value="">Selecione</option>'
            + teachers.map((teacher) => `<option value="${esc(teacher.id)}">${esc(teacher.name)}${teacher.id === me.id ? " (você)" : ""}</option>`).join("");
        const fallback = teachers.some((teacher) => teacher.id === me.id) ? me.id || "" : "";
        teacherSelect.value = teachers.some((teacher) => teacher.id === current) ? current : fallback;
    }
    function resetForm() {
        editing = null;
        form.reset();
        publishedInput.checked = true;
        $("formEyebrow").textContent = "Novo conteúdo";
        $("formTitle").textContent = "Publicar item";
        $("cancelEdit").hidden = true;
        $("typeSwitch").classList.remove("is-locked");
        document.querySelectorAll(".type-option").forEach((button) => { button.disabled = false; });
        fillTeacherSelect(me.id);
        currentSource = "file";
        setType("aula");
    }
    function startEdit(item) {
        editing = item;
        form.reset();
        $("title").value = item.title;
        instrumentSelect.value = item.instrument_slug;
        $("level").value = item.level;
        $("description").value = item.description;
        durationInput.value = item.duration;
        publishedInput.checked = item.published;
        fillTeacherSelect(item.teacher_id);
        const isStoredFile = item.url.includes(STORAGE_MARKER);
        urlInput.value = isStoredFile ? "" : item.url;
        currentSource = isStoredFile ? "file" : "link";
        setType(item.type);
        document.querySelectorAll(".type-option").forEach((button) => { button.disabled = button.dataset.type !== item.type; });
        $("typeSwitch").classList.add("is-locked");
        $("formEyebrow").textContent = "Editando";
        $("formTitle").textContent = "Editar item";
        $("cancelEdit").hidden = false;
        setFeedback("");
        $("publishPanel").scrollIntoView({ behavior: "smooth", block: "start" });
        $("title").focus({ preventScroll: true });
    }
    function validate() {
        var _a, _b;
        const title = $("title").value.trim();
        if (!title)
            return "Informe o título.";
        if (!instrumentSelect.value)
            return "Escolha o instrumento.";
        if (!teacherSelect.value)
            return "Escolha o professor responsável.";
        if (currentSource === "file" && !((_a = resourceInput.files) === null || _a === void 0 ? void 0 : _a.length) && !editing)
            return "Selecione o arquivo para enviar.";
        if (currentSource === "file" && editing && !((_b = resourceInput.files) === null || _b === void 0 ? void 0 : _b.length) && !editing.url.includes(STORAGE_MARKER)) {
            return "Selecione o arquivo para enviar.";
        }
        if (currentSource === "link" && !/^https?:\/\/\S+$/i.test(urlInput.value.trim()))
            return "Informe um link válido começando com https://";
        if (currentType !== "partitura" && durationInput.value.trim() && !/^\d{1,3}(:[0-5]\d){1,2}$/.test(durationInput.value.trim())) {
            return "Duração inválida. Use mm:ss (ex.: 12:40).";
        }
        return null;
    }
    function setProgress(percent) {
        const wrap = $("uploadProgress");
        wrap.hidden = percent === null;
        if (percent === null)
            return;
        $("uploadProgressBar").style.width = `${percent}%`;
        $("uploadProgressLabel").textContent = percent < 100 ? `Enviando… ${percent}%` : "Processando…";
    }
    form.addEventListener("submit", async (event) => {
        var _a;
        event.preventDefault();
        if (busy)
            return;
        setFeedback("");
        const problem = validate();
        if (problem) {
            setFeedback(problem, true);
            return;
        }
        const payload = new FormData();
        payload.set("type", currentType);
        payload.set("title", $("title").value.trim());
        payload.set("instrument", instrumentSelect.value);
        payload.set("level", $("level").value);
        payload.set("description", $("description").value.trim());
        payload.set("teacher_id", teacherSelect.value);
        payload.set("duration", currentType === "partitura" ? "" : durationInput.value.trim());
        payload.set("published", publishedInput.checked ? "true" : "false");
        if (currentSource === "link")
            payload.set("url", urlInput.value.trim());
        const file = currentSource === "file" ? (_a = resourceInput.files) === null || _a === void 0 ? void 0 : _a[0] : undefined;
        if (file)
            payload.set("resource", file, file.name);
        busy = true;
        submitButton.disabled = true;
        setProgress(file ? 0 : null);
        try {
            const path = editing ? `/admin/content/${encodeURIComponent(editing.id)}` : "/admin/content";
            const result = await AppSession.upload(path, editing ? "PATCH" : "POST", payload, file ? setProgress : undefined);
            toast(result.message || "Salvo.");
            resetForm();
            await loadContents();
        }
        catch (error) {
            setFeedback(errorMessage(error, "Não foi possível salvar."), true);
        }
        finally {
            busy = false;
            submitButton.disabled = false;
            setProgress(null);
        }
    });
    document.querySelectorAll(".type-option").forEach((button) => button.addEventListener("click", () => {
        if (editing)
            return;
        setType(button.dataset.type || "aula");
    }));
    document.querySelectorAll(".segment").forEach((button) => button.addEventListener("click", () => {
        setSource(button.dataset.source || "file");
    }));
    publishedInput.addEventListener("change", updateSubmitLabel);
    $("cancelEdit").addEventListener("click", () => { resetForm(); setFeedback(""); });
    // ---------- Catálogo ----------
    function renderList() {
        const query = $("contentSearch").value.trim().toLowerCase();
        const visible = contents.filter((item) => {
            if (activeFilter === "rascunho" ? item.published : activeFilter !== "todos" && item.type !== activeFilter)
                return false;
            if (!query)
                return true;
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
            return `<article class="content-item${(editing === null || editing === void 0 ? void 0 : editing.id) === item.id ? " is-editing" : ""}">`
                + `<span class="content-symbol ${item.type}" aria-hidden="true">${TYPE_SYMBOL[item.type]}</span>`
                + `<div class="content-body"><h3 class="content-title">${esc(item.title)}${item.published ? "" : ' <span class="draft-pill">Rascunho</span>'}</h3>`
                + `<p class="content-meta">${meta}</p></div>`
                + `<div class="content-actions">${link}`
                + `<button class="text-button" type="button" data-edit="${esc(item.id)}">Editar</button>`
                + `<button class="delete-button" type="button" data-delete="${esc(item.id)}" aria-label="Excluir ${esc(item.title)}" title="Excluir">×</button></div>`
                + `</article>`;
        }).join("");
    }
    async function loadContents() {
        try {
            const data = await AppSession.api("/admin/content");
            contents = data.content || [];
            const published = contents.filter((item) => item.published);
            const drafts = contents.length - published.length;
            $("totalCount").textContent = String(published.length);
            $("draftNote").textContent = drafts ? `+ ${drafts} ${drafts === 1 ? "rascunho" : "rascunhos"}` : "visíveis para os alunos";
            $("lessonCount").textContent = String(contents.filter((item) => item.type === "aula").length);
            $("materialCount").textContent = String(contents.filter((item) => item.type !== "aula").length);
            renderList();
        }
        catch (error) {
            list.innerHTML = `<div class="empty-state"><span>!</span><p>${esc(errorMessage(error, "Não foi possível carregar o catálogo."))}</p></div>`;
        }
    }
    list.addEventListener("click", async (event) => {
        const target = event.target;
        const editButton = target.closest("[data-edit]");
        if (editButton) {
            const item = contents.find((content) => content.id === editButton.dataset.edit);
            if (item) {
                startEdit(item);
                renderList();
            }
            return;
        }
        const deleteButton = target.closest("[data-delete]");
        if (!deleteButton)
            return;
        const item = contents.find((content) => content.id === deleteButton.dataset.delete);
        if (!item || !window.confirm(`Excluir "${item.title}"? O arquivo enviado também será apagado. Essa ação não pode ser desfeita.`))
            return;
        deleteButton.disabled = true;
        try {
            await AppSession.api(`/admin/content/${encodeURIComponent(item.id)}`, { method: "DELETE" });
            if ((editing === null || editing === void 0 ? void 0 : editing.id) === item.id)
                resetForm();
            toast("Conteúdo excluído.");
            await loadContents();
        }
        catch (error) {
            deleteButton.disabled = false;
            toast(errorMessage(error, "Não foi possível excluir."), "error");
        }
    });
    document.querySelectorAll(".filter-button").forEach((button) => button.addEventListener("click", () => {
        document.querySelectorAll(".filter-button").forEach((item) => item.classList.toggle("active", item === button));
        activeFilter = button.dataset.filter || "todos";
        renderList();
    }));
    $("contentSearch").addEventListener("input", renderList);
    $("refreshBtn").addEventListener("click", () => { loadContents(); });
    async function loadInstruments() {
        const instruments = (await AppSession.loadInstruments()).slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        const current = instrumentSelect.value;
        instrumentSelect.innerHTML = '<option value="">Selecione</option>'
            + instruments.map((item) => `<option value="${esc(item.slug)}">${esc(item.name)}</option>`).join("");
        if (current)
            instrumentSelect.value = current;
    }
    async function loadTeachers() {
        try {
            const data = await AppSession.api("/admin/teachers");
            teachers = data.teachers || [];
        }
        catch (_a) {
            teachers = me.id ? [{ id: me.id, name: me.name || me.email, role: me.role || "teacher" }] : [];
        }
        fillTeacherSelect((editing === null || editing === void 0 ? void 0 : editing.teacher_id) || me.id);
    }
    // ---------- Usuários ----------
    function renderUsers() {
        const query = $("userSearch").value.trim().toLowerCase();
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
    async function loadUsers() {
        if (!isAdmin())
            return;
        try {
            const data = await AppSession.api("/admin/users");
            users = data.users || [];
            renderUsers();
        }
        catch (error) {
            $("usersBody").innerHTML = `<tr><td colspan="6" class="table-empty">${esc(errorMessage(error, "Não foi possível carregar os usuários."))}</td></tr>`;
        }
    }
    $("usersBody").addEventListener("change", async (event) => {
        const select = event.target.closest(".role-select");
        if (!(select === null || select === void 0 ? void 0 : select.dataset.user))
            return;
        const user = users.find((item) => item.id === select.dataset.user);
        if (!user)
            return;
        const role = select.value;
        const warning = role === "admin"
            ? `Tornar ${user.display_name} administrador? Essa pessoa terá acesso total, inclusive para gerenciar usuários.`
            : `Alterar o papel de ${user.display_name} para ${ROLE_LABEL[role]}?`;
        if (!window.confirm(warning)) {
            select.value = user.role;
            return;
        }
        select.disabled = true;
        try {
            await AppSession.api(`/admin/users/${encodeURIComponent(user.id)}/role`, { method: "POST", json: { role } });
            user.role = role;
            toast(`${user.display_name} agora é ${ROLE_LABEL[role].toLowerCase()}.`);
            renderUsers();
            loadTeachers();
        }
        catch (error) {
            select.value = user.role;
            toast(errorMessage(error, "Não foi possível alterar o papel."), "error");
        }
        finally {
            select.disabled = false;
        }
    });
    $("userSearch").addEventListener("input", renderUsers);
    $("refreshUsersBtn").addEventListener("click", () => { loadUsers(); });
    // ---------- Sessão ----------
    function renderIdentity() {
        $("adminIdentity").textContent = me.name || me.email;
        $("adminRole").textContent = ROLE_LABEL[me.role || ""] || "";
        $("navUsers").hidden = !isAdmin();
    }
    $("logoutButton").addEventListener("click", () => { AppSession.logout(); });
    async function init() {
        renderIdentity();
        try {
            // O papel salvo no navegador pode estar desatualizado: confirma no servidor.
            const data = await AppSession.api("/me");
            me = Object.assign(Object.assign({}, stored), data.user);
            AppSession.saveUser(me);
            if (!AppSession.isStaff(me)) {
                window.location.replace("home.html");
                return;
            }
        }
        catch (error) {
            if (error instanceof AppApiError && error.status === 401)
                return;
        }
        renderIdentity();
        showView();
        resetForm();
        await Promise.all([loadInstruments(), loadTeachers()]);
        await loadContents();
    }
    init();
})();
