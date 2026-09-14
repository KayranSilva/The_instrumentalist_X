"use strict";
(() => {
    "use strict";
    var _a, _b, _c;
    const API_URL = window.location.protocol === "file:" ? "http://localhost:8001" : window.location.origin;
    function getUserFromStorage() {
        try {
            const user = JSON.parse(localStorage.getItem("theInstrumentalistUser") || "null");
            return user && typeof user === "object" && "email" in user && typeof user.email === "string" ? user : null;
        }
        catch (_a) {
            return null;
        }
    }
    function getHomepageUser() {
        const isAdminPreview = new URLSearchParams(window.location.search).get("preview") === "admin";
        return isAdminPreview ? { email: "admin@theinstrumentalist.com", name: "Administrador" } : getUserFromStorage();
    }
    function setText(selector, value) {
        const element = document.querySelector(selector);
        if (element)
            element.textContent = value;
    }
    function getInitial(name) {
        return name.trim().charAt(0).toUpperCase() || "U";
    }
    function getTimeContext(date = new Date()) {
        const hour = date.getHours();
        const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
        const dateLabel = new Intl.DateTimeFormat("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
        }).format(date);
        const dateValue = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
            .map((part) => String(part).padStart(2, "0"))
            .join("-");
        const message = hour < 12
            ? "Comece o dia afinando sua escuta e avance um pouco na sua próxima aula."
            : hour < 18
                ? "Uma pausa para praticar agora pode deixar sua evolução ainda mais consistente."
                : "Feche o dia com música: você está a duas lições de completar o módulo de Violão Popular.";
        return { greeting, dateLabel, dateValue, message, dayIndex: (date.getDay() + 6) % 7 };
    }
    function updateTimeContext(userName) {
        const context = getTimeContext();
        setText(".hero-greet h1", `${context.greeting}, ${userName}.`);
        setText(".hero-greet p", context.message);
        const dateElement = document.querySelector("#heroDate");
        if (dateElement) {
            dateElement.textContent = context.dateLabel;
            dateElement.dateTime = context.dateValue;
        }
        const days = document.querySelectorAll(".streak-day");
        days.forEach((day, index) => {
            var _a;
            day.classList.toggle("is-today", index === context.dayIndex);
            day.setAttribute("aria-label", `${((_a = day.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || "Dia"}${index === context.dayIndex ? ", hoje" : ""}`);
        });
    }
    function renderHomepage(data) {
        if (!data.success)
            return;
        const user = data.user || { email: "" };
        const hero = data.hero || {};
        const lesson = hero.continue_lesson;
        const journey = data.journey || {};
        const displayName = user.name || "Marina";
        setText(".user-name", displayName);
        const userAvatar = document.querySelector("#userChip .avatar");
        if (userAvatar)
            userAvatar.textContent = getInitial(displayName);
        updateTimeContext(displayName);
        if (lesson) {
            document.querySelector(".continue-card")?.removeAttribute("hidden");
            setText(".continue-info .tag", `${lesson.instrument} · ${lesson.module}`);
            setText(".continue-info h3", lesson.title);
            setText(".continue-info .progress-label", `${lesson.progress}% concluído · ${lesson.time_remaining}`);
            const progress = document.querySelector(".continue-info .progress-fill");
            if (progress)
                progress.style.width = `${lesson.progress}%`;
        }
        const lessonRow = document.getElementById("lessonRow");
        const lessonSection = document.getElementById("lessons");
        if (lessonRow && (data.lessons === null || data.lessons === void 0 ? void 0 : data.lessons.length)) {
            lessonSection?.removeAttribute("hidden");
            lessonRow.replaceChildren(...data.lessons.map((item) => createLessonCard(item)));
        }
        else {
            lessonSection?.setAttribute("hidden", "");
        }
        const instrumentGrid = document.querySelector(".instrument-grid");
        if (instrumentGrid && data.instruments) {
            instrumentGrid.replaceChildren(...data.instruments.map((item) => createInstrumentCard(item)));
        }
        if (journey.level)
            setText(".level-ring-inner b", String(journey.level));
        if (journey.xp_needed && journey.level)
            setText(".level-info p", `Faltam ${journey.xp_needed} XP para o nível ${journey.level + 1} — continue praticando para desbloquear o desafio semanal.`);
        if (journey.progress) {
            const progress = document.querySelector(".level-info .progress-fill");
            if (progress)
                progress.style.width = `${journey.progress}%`;
        }
        if (journey.xp_current && journey.xp_goal)
            setText(".level-info .progress-label", `${journey.xp_current} / ${journey.xp_goal} XP`);
        const stats = data.hero?.stats || [];
        stats.forEach((stat) => {
            const statPill = Array.from(document.querySelectorAll(".stat-pill")).find((pill) => { var _a; return (_a = pill.textContent) === null || _a === void 0 ? void 0 : _a.includes(stat.label); });
            if (statPill)
                statPill.querySelector("b").textContent = stat.label === "Nível" ? `Nível ${stat.value}` : stat.value;
        });
        if (journey.streak !== undefined)
            setText(".streak-note", journey.streak ? `Pratique hoje para manter os ${journey.streak} dias seguidos.` : "Pratique hoje para começar sua sequência.");
        if (journey.weekly_sequence)
            document.querySelectorAll(".streak-day").forEach((day, index) => { var _a; return day.classList.toggle("is-done", Boolean((_a = journey.weekly_sequence) === null || _a === void 0 ? void 0 : _a[index])); });
        if (journey.badges)
            document.querySelectorAll(".badges-grid .badge").forEach((badge, index) => { var _a; return badge.classList.toggle("is-locked", !((_a = journey.badges) === null || _a === void 0 ? void 0 : _a[index]?.unlocked)); });
        const leaderboard = document.querySelector(".leaderboard-list");
        if (leaderboard && journey.ranking) {
            leaderboard.replaceChildren(...journey.ranking.map((entry) => {
                const item = document.createElement("li");
                if (entry.is_you)
                    item.className = "is-you";
                const avatar = entry.is_you ? getInitial(displayName) : entry.avatar;
                const rankingName = entry.is_you ? `${displayName} (você)` : entry.name;
                item.innerHTML = `<span class="rank">${entry.rank}</span><span class="avatar avatar--sm">${avatar}</span><span class="lb-name">${rankingName}</span><span class="lb-xp">${entry.xp} XP</span>`;
                return item;
            }));
        }
    }
    function createLessonCard(lesson) {
        const article = document.createElement("article");
        article.className = "lesson-card";
        article.dataset.instrument = lesson.instrument;
        const theme = lesson.instrument === "piano" ? "teal" : lesson.instrument === "bateria" ? "yellow" : "violet";
        const instrumentNames = { violao: "Violão", piano: "Piano", bateria: "Bateria", canto: "Canto" };
        article.innerHTML = `<div class="lesson-thumb lesson-thumb--${theme}"><button class="play-btn" aria-label="Assistir ${lesson.title}"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7Z"/></svg></button><span class="lesson-duration">${lesson.duration}</span>${lesson.badge ? `<span class="lesson-badge">${lesson.badge}</span>` : ""}</div><span class="lesson-tag">${instrumentNames[lesson.instrument] || "Instrumento"}</span><h3>${lesson.title}</h3><p class="lesson-teacher">com ${lesson.teacher}</p><div class="progress-track progress-track--sm"><div class="progress-fill" data-progress="${lesson.progress}" style="width:0%"></div></div>`;
        return article;
    }
    function createInstrumentCard(item) {
        const link = document.createElement("a");
        link.className = "instrument-card";
        link.href = "#lessons";
        link.innerHTML = `<span class="instrument-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${getInstrumentSvg(item.icon)}</svg></span><h3>${item.name}</h3><span class="instrument-meta">${item.meta}</span>`;
        return link;
    }
    function getInstrumentSvg(icon) {
        const map = {
            violao: '<path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
            piano: '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M7 6v12M11 6v12M15 6v12"/>',
            bateria: '<ellipse cx="12" cy="8" rx="7" ry="3"/><path d="M5 8v7a7 3 0 0 0 14 0V8"/><path d="M12 15v4"/>',
            violino: '<path d="M12 3c2.5 0 3 1.6 3 3s-1 2-1 3.5c2 .5 3.5 2.5 3.5 5A5.5 5.5 0 1 1 6.5 9c1.5 0 2-1 2-2 0-1.4.5-4 3.5-4Z"/><circle cx="12" cy="14.5" r="1.4"/>',
            ukulele: '<path d="M10 17V7l6-1.2V15"/><circle cx="7.5" cy="17" r="2.5"/><circle cx="14" cy="15" r="2.5"/>',
            canto: '<path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
        };
        return map[icon] || map.violao;
    }
    function animateProgress() {
        document.querySelectorAll(".progress-fill[data-progress]").forEach((bar) => {
            requestAnimationFrame(() => { bar.style.width = `${bar.dataset.progress || 0}%`; });
        });
    }
    async function loadHomepage() {
        const user = getHomepageUser();
        if (!user) {
            window.location.href = "login.html";
            return;
        }
        try {
            const response = await fetch(`${API_URL}/homepage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email }) });
            renderHomepage(await response.json());
        }
        catch (error) {
            console.error("Erro ao carregar homepage:", error);
        }
    }
    window.setInterval(() => {
        const user = getHomepageUser();
        if (user)
            updateTimeContext(user.name || "Usuário");
    }, 60000);
    (_a = document.getElementById("navToggle")) === null || _a === void 0 ? void 0 : _a.addEventListener("click", () => {
        const nav = document.getElementById("navLinks");
        const toggle = document.getElementById("navToggle");
        if (!nav || !toggle)
            return;
        const isOpen = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
    });
    (_b = document.getElementById("filterTabs")) === null || _b === void 0 ? void 0 : _b.addEventListener("click", (event) => {
        const target = event.target;
        const button = target.closest(".filter-tab");
        if (!button)
            return;
        document.querySelectorAll(".filter-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
        const filter = button.dataset.filter || "all";
        document.querySelectorAll(".lesson-card").forEach((card) => card.classList.toggle("is-hidden", filter !== "all" && card.dataset.instrument !== filter));
    });
    const userChip = document.getElementById("userChip");
    const userMenu = document.getElementById("userMenu");
    const closeUserMenu = () => {
        userMenu === null || userMenu === void 0 ? void 0 : userMenu.classList.remove("is-open");
        userChip === null || userChip === void 0 ? void 0 : userChip.setAttribute("aria-expanded", "false");
    };
    userChip === null || userChip === void 0 ? void 0 : userChip.addEventListener("click", () => {
        const isOpen = (userMenu === null || userMenu === void 0 ? void 0 : userMenu.classList.toggle("is-open")) || false;
        userChip.setAttribute("aria-expanded", String(isOpen));
    });
    (_c = document.getElementById("logoutButton")) === null || _c === void 0 ? void 0 : _c.addEventListener("click", () => {
        localStorage.removeItem("theInstrumentalistUser");
        window.location.href = "login.html";
    });
    document.addEventListener("click", (event) => {
        var _a;
        if (!((_a = event.target.parentElement) === null || _a === void 0 ? void 0 : _a.closest(".user-menu-wrap")))
            closeUserMenu();
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape")
        closeUserMenu(); });
    if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", () => { animateProgress(); loadHomepage(); });
    else {
        animateProgress();
        loadHomepage();
    }
})();
