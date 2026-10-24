"use strict";
(() => {
    "use strict";
    var _a, _b, _c, _d, _e, _f, _g;
    const storedUser = AppSession.requireUser();
    if (!storedUser)
        return;
    const esc = AppSession.escapeHtml;
    const $ = (id) => document.getElementById(id);
    let homepage = null;
    let activeFilter = "all";
    let currentLesson = null;
    let firstLoad = true;
    const TYPE_LABEL = { aula: "Aula", musica: "Música", partitura: "Partitura" };
    const TYPE_THUMB = { aula: "violet", musica: "teal", partitura: "yellow" };
    const TYPE_ICON = {
        aula: '<path d="M8 5v14l11-7Z" fill="currentColor" stroke="none"/>',
        musica: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
        partitura: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
    };
    const BADGE_ICON = {
        "primeiro-passo": '<circle cx="12" cy="9" r="5.5"/><path d="M9 13.5 7.5 21 12 18.5 16.5 21 15 13.5"/>',
        constancia: '<path d="M12 3c1 3-2 4-2 7a3 3 0 1 0 6 0c0-1-1-2-1-2 2 1 3 3 3 5a6 6 0 1 1-12 0c0-4 3-5 4-8 1-1 1-2 2-2Z"/>',
        maratona: '<path d="M12 3c1 3-2 4-2 7a3 3 0 1 0 6 0c0-1-1-2-1-2 2 1 3 3 3 5a6 6 0 1 1-12 0c0-4 3-5 4-8 1-1 1-2 2-2Z"/><path d="M4 21h16"/>',
        explorador: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    };
    const LOCK_ICON = '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>';
    function svg(paths, size = 20) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${paths}</svg>`;
    }
    function setText(id, value) {
        const element = $(id);
        if (element)
            element.textContent = value;
    }
    // ---------- Toast ----------
    let toastTimer = 0;
    function toast(message, kind = "info") {
        const element = $("toast");
        if (!element)
            return;
        element.textContent = message;
        element.className = `toast toast--${kind}`;
        element.hidden = false;
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => { element.hidden = true; }, 4200);
    }
    // ---------- Overlays (player e troca de instrumento) ----------
    let lastFocused = null;
    function openOverlay(id) {
        var _a;
        const overlay = $(id);
        if (!overlay)
            return;
        lastFocused = document.activeElement;
        overlay.hidden = false;
        document.body.classList.add("no-scroll");
        (_a = overlay.querySelector("[data-close]")) === null || _a === void 0 ? void 0 : _a.focus();
    }
    function closeOverlay(id) {
        var _a;
        const overlay = $(id);
        if (!overlay || overlay.hidden)
            return;
        overlay.hidden = true;
        if (id === "playerOverlay") {
            (_a = $("playerMedia")) === null || _a === void 0 ? void 0 : _a.replaceChildren();
            currentLesson = null;
        }
        if (!document.querySelector(".overlay:not([hidden])"))
            document.body.classList.remove("no-scroll");
        if (lastFocused instanceof HTMLElement)
            lastFocused.focus();
    }
    document.querySelectorAll(".overlay").forEach((overlay) => {
        overlay.addEventListener("click", (event) => {
            const target = event.target;
            if (target === overlay || target.closest("[data-close]"))
                closeOverlay(overlay.id);
        });
    });
    // ---------- Saudação e data ----------
    function updateGreeting(name) {
        const now = new Date();
        const hour = now.getHours();
        const greeting = hour < 5 ? "Boa noite" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
        const firstName = name.trim().split(/\s+/)[0] || "";
        setText("heroGreeting", firstName ? `${greeting}, ${firstName}.` : `${greeting}!`);
        const date = $("heroDate");
        if (date) {
            date.textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(now);
            date.dateTime = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, "0")).join("-");
        }
        const todayIndex = (now.getDay() + 6) % 7;
        document.querySelectorAll(".streak-day").forEach((day, index) => day.classList.toggle("is-today", index === todayIndex));
    }
    function heroMessage(data) {
        const { completed_count: done, total_count: total } = data.journey;
        if (!total)
            return "Ainda não há aulas publicadas. Novos conteúdos chegam em breve!";
        if (done >= total)
            return "Você concluiu todos os conteúdos disponíveis. Novas aulas chegam em breve!";
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12)
            return "Comece o dia afinando sua escuta e avance um pouco na sua próxima aula.";
        if (hour >= 12 && hour < 18)
            return "Uma pausa para praticar agora deixa sua evolução ainda mais consistente.";
        return "Feche o dia com música: escolha uma aula e continue de onde parou.";
    }
    function renderUser(name, email, role) {
        var _a, _b;
        setText("userName", name.split(/\s+/)[0] || name);
        setText("userAvatar", AppSession.initial(name));
        setText("menuName", name);
        setText("menuEmail", email);
        const staff = role === "admin" || role === "teacher";
        (_a = $("navAdmin")) === null || _a === void 0 ? void 0 : _a.toggleAttribute("hidden", !staff);
        (_b = $("menuAdmin")) === null || _b === void 0 ? void 0 : _b.toggleAttribute("hidden", !staff);
        updateGreeting(name);
    }
    // ---------- Conteúdos ----------
    function createLessonCard(lesson, groupName) {
        const card = document.createElement("article");
        card.className = `lesson-card${lesson.completed ? " is-completed" : ""}`;
        const meta = [lesson.teacher ? `com ${lesson.teacher}` : "", lesson.level].filter(Boolean).join(" · ");
        card.innerHTML = `
      <button class="lesson-open" type="button" data-lesson="${esc(lesson.id)}" aria-label="Abrir ${esc(TYPE_LABEL[lesson.type])}: ${esc(lesson.title)}">
        <div class="lesson-thumb lesson-thumb--${TYPE_THUMB[lesson.type]}">
          <span class="play-btn">${svg(TYPE_ICON[lesson.type], 16)}</span>
          ${lesson.duration ? `<span class="lesson-duration">${esc(lesson.duration)}</span>` : ""}
          <span class="lesson-badge">${lesson.completed ? "✓ Concluída" : esc(TYPE_LABEL[lesson.type])}</span>
        </div>
        <span class="lesson-tag">${esc(groupName)}</span>
        <h3>${esc(lesson.title)}</h3>
        <p class="lesson-teacher">${esc(meta)}</p>
      </button>`;
        return card;
    }
    function renderLessonGroups(groups) {
        const container = $("lessonGroups");
        const tabs = $("filterTabs");
        if (!container || !tabs)
            return;
        if (!groups.length) {
            tabs.replaceChildren();
            container.innerHTML = '<div class="empty-card"><b>Nenhuma aula publicada ainda.</b><p>Assim que os professores publicarem conteúdos, eles aparecem aqui.</p></div>';
            return;
        }
        container.replaceChildren(...groups.map((group) => {
            const wrapper = document.createElement("section");
            wrapper.className = "lesson-group";
            wrapper.dataset.instrument = group.instrument_slug;
            const done = group.lessons.filter((lesson) => lesson.completed).length;
            wrapper.innerHTML = `<div class="lesson-group-head"><h3>${esc(group.instrument_name)}</h3>`
                + `${group.is_primary ? '<span class="lesson-group-tag">Seu instrumento</span>' : ""}`
                + `<span class="lesson-group-count">${done}/${group.lessons.length} concluídas</span></div>`;
            const row = document.createElement("div");
            row.className = "lesson-row";
            row.replaceChildren(...group.lessons.map((lesson) => createLessonCard(lesson, group.instrument_name)));
            wrapper.appendChild(row);
            return wrapper;
        }));
        const tabItems = [{ slug: "all", label: "Todos" }, ...groups.map((group) => ({ slug: group.instrument_slug, label: group.instrument_name }))];
        if (!tabItems.some((tab) => tab.slug === activeFilter))
            activeFilter = "all";
        tabs.replaceChildren(...tabItems.map((tab) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "filter-tab";
            button.setAttribute("role", "tab");
            button.dataset.filter = tab.slug;
            button.textContent = tab.label;
            return button;
        }));
        applyFilter(activeFilter);
    }
    function applyFilter(slug) {
        activeFilter = slug;
        document.querySelectorAll(".filter-tab").forEach((tab) => {
            const active = tab.dataset.filter === slug;
            tab.classList.toggle("active", active);
            tab.setAttribute("aria-selected", String(active));
        });
        document.querySelectorAll(".lesson-group").forEach((group) => {
            group.classList.toggle("is-hidden", slug !== "all" && group.dataset.instrument !== slug);
        });
    }
    function findLesson(id) {
        for (const group of (homepage === null || homepage === void 0 ? void 0 : homepage.lesson_groups) || []) {
            const lesson = group.lessons.find((item) => item.id === id);
            if (lesson)
                return { lesson, groupName: group.instrument_name };
        }
        return null;
    }
    function renderContinue(groups) {
        const card = $("continueCard");
        if (!card)
            return;
        const group = groups.find((item) => item.lessons.some((lesson) => !lesson.completed));
        const next = group === null || group === void 0 ? void 0 : group.lessons.find((lesson) => !lesson.completed);
        if (!group || !next) {
            card.hidden = true;
            return;
        }
        const done = group.lessons.filter((lesson) => lesson.completed).length;
        setText("continueTag", `${group.instrument_name} · ${TYPE_LABEL[next.type]}`);
        setText("continueTitle", next.title);
        setText("continueLabel", `${done} de ${group.lessons.length} concluídas em ${group.instrument_name}`);
        setText("continueButton", done ? "Continuar" : "Começar");
        const progress = $("continueProgress");
        if (progress)
            progress.style.width = `${Math.round((done / group.lessons.length) * 100)}%`;
        $("continueButton").dataset.lesson = next.id;
        card.hidden = false;
    }
    // ---------- Instrumentos ----------
    function renderInstruments(instruments) {
        const grid = $("instrumentGrid");
        if (!grid)
            return;
        grid.replaceChildren(...instruments.map((item) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "instrument-card";
            button.dataset.instrument = item.slug;
            const meta = item.is_primary
                ? "Seu instrumento principal"
                : item.content_count ? `${item.content_count} ${item.content_count === 1 ? "conteúdo" : "conteúdos"}` : "Em breve";
            button.innerHTML = `<span class="instrument-icon">${AppSession.instrumentIcon(item.slug)}</span>`
                + `<h3>${esc(item.name)}</h3><span class="instrument-meta">${esc(meta)}</span>`;
            return button;
        }));
    }
    // ---------- Jornada ----------
    function levelTitle(level) {
        if (level >= 10)
            return "Mestre do instrumento";
        if (level >= 6)
            return "Músico em evolução";
        if (level >= 3)
            return "Instrumentista dedicado";
        return "Iniciante";
    }
    function renderJourney(journey) {
        var _a;
        const percent = journey.xp_per_level ? Math.round((journey.xp_in_level / journey.xp_per_level) * 100) : 0;
        const missing = journey.xp_per_level - journey.xp_in_level;
        setText("statStreak", String(journey.streak));
        setText("statXpMonth", journey.xp_month.toLocaleString("pt-BR"));
        setText("statLevel", `Nível ${journey.level}`);
        setText("levelNumber", String(journey.level));
        setText("levelTitle", levelTitle(journey.level));
        setText("levelMessage", `Faltam ${missing} XP para o nível ${journey.level + 1}. Cada conteúdo concluído vale 20 XP.`);
        setText("levelLabel", `${journey.xp_in_level} / ${journey.xp_per_level} XP · ${journey.xp_total.toLocaleString("pt-BR")} XP no total`);
        (_a = $("levelRing")) === null || _a === void 0 ? void 0 : _a.style.setProperty("--ring", String(percent));
        const bar = $("levelProgress");
        if (bar)
            requestAnimationFrame(() => { bar.style.width = `${percent}%`; });
        document.querySelectorAll(".streak-day").forEach((day, index) => {
            const done = Boolean(journey.weekly_sequence[index]);
            day.classList.toggle("is-done", done);
            day.setAttribute("aria-label", `${day.title}${done ? ": praticou" : ""}`);
        });
        const practicedToday = Boolean(journey.weekly_sequence[(new Date().getDay() + 6) % 7]);
        setText("streakNote", journey.streak
            ? practicedToday
                ? `Você está há ${journey.streak} ${journey.streak === 1 ? "dia" : "dias"} seguidos praticando. Continue amanhã!`
                : `Conclua uma aula hoje para manter seus ${journey.streak} ${journey.streak === 1 ? "dia" : "dias"} seguidos.`
            : "Conclua uma aula hoje para começar sua sequência.");
        const badges = $("badgesGrid");
        if (badges) {
            badges.innerHTML = journey.badges.length
                ? journey.badges.map((badge) => `<div class="badge${badge.unlocked ? " is-unlocked" : ""}" title="${esc(badge.description)}">`
                    + `${svg(badge.unlocked ? (BADGE_ICON[badge.slug] || BADGE_ICON["primeiro-passo"]) : LOCK_ICON)}`
                    + `<span>${esc(badge.name)}</span></div>`).join("")
                : '<p class="muted-note">Nenhuma conquista disponível.</p>';
        }
        const leaderboard = $("leaderboard");
        if (leaderboard) {
            const ranking = journey.ranking.filter((entry) => entry.xp > 0 || entry.is_you);
            const someoneScored = ranking.some((entry) => entry.xp > 0);
            leaderboard.innerHTML = someoneScored
                ? ranking.map((entry) => `<li${entry.is_you ? ' class="is-you"' : ""}><span class="rank">${entry.rank}</span>`
                    + `<span class="avatar avatar--sm" aria-hidden="true">${esc(AppSession.initial(entry.name))}</span>`
                    + `<span class="lb-name">${esc(entry.name)}${entry.is_you ? " (você)" : ""}</span>`
                    + `<span class="lb-xp">${entry.xp.toLocaleString("pt-BR")} XP</span></li>`).join("")
                : '<li class="leaderboard-empty">Conclua aulas para aparecer no ranking.</li>';
        }
    }
    function render(data) {
        homepage = data;
        renderUser(data.user.name, data.user.email, data.user.role);
        setText("heroMessage", heroMessage(data));
        renderContinue(data.lesson_groups);
        renderLessonGroups(data.lesson_groups);
        renderInstruments(data.instruments);
        renderJourney(data.journey);
    }
    // ---------- Player ----------
    function isHttpUrl(value) { return /^https?:\/\//i.test(value); }
    function buildMedia(lesson) {
        const url = isHttpUrl(lesson.media_url) ? lesson.media_url : "";
        const wrap = document.createElement("div");
        if (!url) {
            wrap.className = "player-fallback";
            wrap.textContent = "Este conteúdo está indisponível no momento.";
            return wrap;
        }
        switch (lesson.media_kind) {
            case "video": {
                const video = document.createElement("video");
                video.controls = true;
                video.preload = "metadata";
                video.playsInline = true;
                video.src = url;
                video.addEventListener("error", () => wrap.replaceChildren(fallback("Não foi possível reproduzir o vídeo aqui.", url)));
                wrap.appendChild(video);
                break;
            }
            case "audio": {
                const audio = document.createElement("audio");
                audio.controls = true;
                audio.preload = "metadata";
                audio.src = url;
                wrap.className = "player-audio";
                wrap.appendChild(audio);
                break;
            }
            case "youtube":
            case "vimeo":
            case "pdf": {
                const frame = document.createElement("iframe");
                frame.src = url;
                frame.title = lesson.title;
                frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
                frame.allowFullscreen = true;
                frame.referrerPolicy = "strict-origin-when-cross-origin";
                if (lesson.media_kind === "pdf")
                    wrap.className = "player-pdf";
                wrap.appendChild(frame);
                break;
            }
            case "image": {
                const image = document.createElement("img");
                image.src = url;
                image.alt = lesson.title;
                wrap.appendChild(image);
                break;
            }
            default:
                wrap.appendChild(fallback("Este conteúdo abre no site de origem.", url));
        }
        if (!wrap.className)
            wrap.className = "player-frame";
        return wrap;
    }
    function fallback(message, url) {
        const box = document.createElement("div");
        box.className = "player-fallback";
        const text = document.createElement("p");
        text.textContent = message;
        const link = document.createElement("a");
        link.className = "btn-primary";
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = "Abrir conteúdo ↗";
        box.append(text, link);
        return box;
    }
    function updateCompleteButton(lesson) {
        const button = $("completeButton");
        if (!button)
            return;
        button.disabled = lesson.completed;
        button.textContent = lesson.completed ? "✓ Concluída" : "Marcar como concluída  +20 XP";
    }
    function openPlayer(id) {
        var _a, _b;
        const found = findLesson(id);
        if (!found)
            return;
        currentLesson = found;
        const { lesson, groupName } = found;
        setText("playerTag", `${groupName} · ${TYPE_LABEL[lesson.type]}`);
        setText("playerTitle", lesson.title);
        setText("playerMeta", [lesson.teacher ? `com ${lesson.teacher}` : "", lesson.level, lesson.duration].filter(Boolean).join(" · "));
        setText("playerDescription", lesson.description);
        (_a = $("playerDescription")) === null || _a === void 0 ? void 0 : _a.toggleAttribute("hidden", !lesson.description);
        (_b = $("playerMedia")) === null || _b === void 0 ? void 0 : _b.replaceChildren(buildMedia(lesson));
        const external = $("playerExternal");
        if (external) {
            const usable = isHttpUrl(lesson.media_url);
            external.hidden = !usable;
            external.href = usable ? lesson.media_url : "#";
        }
        updateCompleteButton(lesson);
        openOverlay("playerOverlay");
    }
    (_a = $("completeButton")) === null || _a === void 0 ? void 0 : _a.addEventListener("click", async () => {
        if (!currentLesson || currentLesson.lesson.completed)
            return;
        const button = $("completeButton");
        const lesson = currentLesson.lesson;
        button.disabled = true;
        button.textContent = "Salvando…";
        try {
            const result = await AppSession.api(`/content/${encodeURIComponent(lesson.id)}/complete`, { method: "POST" });
            lesson.completed = true;
            updateCompleteButton(lesson);
            const badges = result.new_badges || [];
            toast(badges.length ? `${result.message} Nova conquista: ${badges.join(", ")}!` : result.message, "success");
            await loadHomepage();
        }
        catch (error) {
            if (error instanceof AppApiError && error.status === 401)
                return;
            toast(error instanceof Error ? error.message : "Não foi possível salvar.", "error");
            updateCompleteButton(lesson);
        }
    });
    // ---------- Troca de instrumento principal ----------
    async function openInstrumentDialog(required = false) {
        const picker = $("instrumentPicker");
        if (!picker)
            return;
        setText("instrumentDialogTitle", required ? "Escolha seu instrumento principal" : "Seu instrumento principal");
        setText("instrumentFormError", "");
        picker.innerHTML = '<span class="muted-note">Carregando…</span>';
        openOverlay("instrumentOverlay");
        const instruments = (await AppSession.loadInstruments()).slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        const current = (homepage === null || homepage === void 0 ? void 0 : homepage.user.primary_instrument) || "";
        picker.innerHTML = instruments.map((item) => `<label class="instrument-option">`
            + `<input type="radio" name="primaryInstrument" value="${esc(item.slug)}"${item.slug === current ? " checked" : ""}>`
            + `<span class="instrument-option-icon">${AppSession.instrumentIcon(item.slug, 22)}</span>`
            + `<span class="instrument-option-name">${esc(item.name)}</span></label>`).join("");
    }
    (_b = $("instrumentForm")) === null || _b === void 0 ? void 0 : _b.addEventListener("submit", async (event) => {
        var _a;
        event.preventDefault();
        const selected = (_a = document.querySelector('input[name="primaryInstrument"]:checked')) === null || _a === void 0 ? void 0 : _a.value;
        if (!selected) {
            setText("instrumentFormError", "Escolha um instrumento.");
            return;
        }
        const button = $("instrumentSave");
        button.disabled = true;
        try {
            await AppSession.api("/profile/instrument", { method: "POST", json: { instrument_slug: selected } });
            closeOverlay("instrumentOverlay");
            activeFilter = "all";
            toast("Instrumento principal atualizado.", "success");
            await loadHomepage();
        }
        catch (error) {
            setText("instrumentFormError", error instanceof Error ? error.message : "Não foi possível salvar.");
        }
        finally {
            button.disabled = false;
        }
    });
    // ---------- Carregamento ----------
    async function loadHomepage() {
        var _a, _b;
        try {
            const data = await AppSession.api("/homepage", { method: "POST" });
            (_a = $("loadError")) === null || _a === void 0 ? void 0 : _a.setAttribute("hidden", "");
            render(data);
            const user = AppSession.getUser();
            if (user)
                AppSession.saveUser(Object.assign(Object.assign({}, user), { email: data.user.email, name: data.user.name, role: data.user.role }));
            if (firstLoad) {
                firstLoad = false;
                if (!data.user.primary_instrument)
                    openInstrumentDialog(true);
            }
        }
        catch (error) {
            if (error instanceof AppApiError && error.status === 401)
                return;
            (_b = $("loadError")) === null || _b === void 0 ? void 0 : _b.removeAttribute("hidden");
            setText("heroMessage", error instanceof Error ? error.message : "Não foi possível carregar suas aulas.");
            if (!homepage) {
                const groups = $("lessonGroups");
                if (groups)
                    groups.innerHTML = "";
            }
        }
    }
    // ---------- Eventos ----------
    document.addEventListener("click", (event) => {
        var _a;
        const target = event.target;
        const opener = target.closest("[data-lesson]");
        if (opener === null || opener === void 0 ? void 0 : opener.dataset.lesson) {
            openPlayer(opener.dataset.lesson);
            return;
        }
        const tab = target.closest(".filter-tab");
        if (tab) {
            applyFilter(tab.dataset.filter || "all");
            return;
        }
        const instrumentCard = target.closest(".instrument-card");
        if (instrumentCard === null || instrumentCard === void 0 ? void 0 : instrumentCard.dataset.instrument) {
            const slug = instrumentCard.dataset.instrument;
            const item = homepage === null || homepage === void 0 ? void 0 : homepage.instruments.find((instrument) => instrument.slug === slug);
            if (!(item === null || item === void 0 ? void 0 : item.content_count)) {
                toast(`Ainda não há conteúdos de ${(item === null || item === void 0 ? void 0 : item.name) || "este instrumento"}. Em breve!`);
                return;
            }
            applyFilter(slug);
            (_a = $("lessons")) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });
    (_c = $("retryButton")) === null || _c === void 0 ? void 0 : _c.addEventListener("click", () => { loadHomepage(); });
    (_d = $("navToggle")) === null || _d === void 0 ? void 0 : _d.addEventListener("click", () => {
        const nav = $("navLinks");
        const toggle = $("navToggle");
        if (!nav || !toggle)
            return;
        const isOpen = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
    });
    (_e = $("navLinks")) === null || _e === void 0 ? void 0 : _e.addEventListener("click", (event) => {
        var _a, _b;
        if (event.target.closest("a")) {
            (_a = $("navLinks")) === null || _a === void 0 ? void 0 : _a.classList.remove("is-open");
            (_b = $("navToggle")) === null || _b === void 0 ? void 0 : _b.setAttribute("aria-expanded", "false");
        }
    });
    const userChip = $("userChip");
    const userMenu = $("userMenu");
    const closeUserMenu = () => { userMenu === null || userMenu === void 0 ? void 0 : userMenu.classList.remove("is-open"); userChip === null || userChip === void 0 ? void 0 : userChip.setAttribute("aria-expanded", "false"); };
    userChip === null || userChip === void 0 ? void 0 : userChip.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = (userMenu === null || userMenu === void 0 ? void 0 : userMenu.classList.toggle("is-open")) || false;
        userChip.setAttribute("aria-expanded", String(isOpen));
    });
    document.addEventListener("click", (event) => {
        if (!event.target.closest(".user-menu-wrap"))
            closeUserMenu();
    });
    (_f = $("changeInstrumentButton")) === null || _f === void 0 ? void 0 : _f.addEventListener("click", () => { closeUserMenu(); openInstrumentDialog(); });
    (_g = $("logoutButton")) === null || _g === void 0 ? void 0 : _g.addEventListener("click", () => { AppSession.logout(); });
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape")
            return;
        closeUserMenu();
        document.querySelectorAll(".overlay:not([hidden])").forEach((overlay) => closeOverlay(overlay.id));
    });
    setText("footerCopy", `© ${new Date().getFullYear()} The Instrumentalist`);
    renderUser(storedUser.name || "", storedUser.email || "", storedUser.role || "student");
    window.setInterval(() => updateGreeting((homepage === null || homepage === void 0 ? void 0 : homepage.user.name) || storedUser.name || ""), 60000);
    loadHomepage();
})();
