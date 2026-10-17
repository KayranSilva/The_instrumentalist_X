(() => {
  "use strict";

  const API_URL = window.location.protocol === "file:" ? "http://localhost:8001" : window.location.origin;
  const USER_KEY = "theInstrumentalistUser";

  type StoredUser = {
    email: string;
    name?: string;
    role?: string;
    access_token?: string;
    refresh_token?: string;
  };

  type LessonItem = { id: string; title: string; teacher: string; duration: string; level: string; badge?: string | null };
  type LessonGroup = { instrument_slug: string; instrument_name: string; is_primary: boolean; lessons: LessonItem[] };

  type HomepageData = {
    success: boolean;
    message?: string;
    user?: StoredUser;
    hero?: {
      greeting?: string;
      message?: string;
      continue_lesson?: { instrument: string; module: string; title: string; progress: number; time_remaining: string };
      stats?: Array<{ label: string; value: string; icon: string }>;
    };
    lesson_groups?: LessonGroup[];
    instruments?: Array<{ name: string; meta: string; icon: string }>;
    journey?: {
      level?: number;
      xp_needed?: number;
      progress?: number;
      xp_current?: number;
      xp_goal?: number;
      streak?: number;
      weekly_sequence?: boolean[];
      badges?: Array<{ name: string; unlocked: boolean }>;
      ranking?: Array<{ rank: number; name: string; xp: number; avatar: string; is_you?: boolean }>;
    };
  };

  function getUserFromStorage(): StoredUser | null {
    try {
      const user: unknown = JSON.parse(localStorage.getItem(USER_KEY) || "null");
      return user && typeof user === "object" && "email" in user && typeof (user as StoredUser).email === "string" ? user as StoredUser : null;
    } catch {
      return null;
    }
  }

  function saveUser(user: StoredUser): void {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* localStorage indisponível */ }
  }

  function goToLogin(): void {
    try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
    window.location.href = "login.html";
  }

  function setText(selector: string, value: string): void {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  }

  function getInitial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || "U";
  }

  type TimeContext = { greeting: string; dateLabel: string; dateValue: string; message: string; dayIndex: number };

  function getTimeContext(date = new Date()): TimeContext {
    const hour = date.getHours();
    const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
    const dateLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(date);
    const dateValue = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, "0")).join("-");
    const message = hour < 12
      ? "Comece o dia afinando sua escuta e avance um pouco na sua próxima aula."
      : hour < 18
        ? "Uma pausa para praticar agora pode deixar sua evolução ainda mais consistente."
        : "Feche o dia com música: escolha uma aula e continue de onde parou.";
    return { greeting, dateLabel, dateValue, message, dayIndex: (date.getDay() + 6) % 7 };
  }

  function updateTimeContext(userName: string): void {
    const context = getTimeContext();
    setText(".hero-greet h1", `${context.greeting}, ${userName}.`);
    setText(".hero-greet p", context.message);
    const dateElement = document.querySelector<HTMLTimeElement>("#heroDate");
    if (dateElement) { dateElement.textContent = context.dateLabel; dateElement.dateTime = context.dateValue; }
    document.querySelectorAll<HTMLElement>(".streak-day").forEach((day, index) => {
      day.classList.toggle("is-today", index === context.dayIndex);
      day.setAttribute("aria-label", `${day.textContent?.trim() || "Dia"}${index === context.dayIndex ? ", hoje" : ""}`);
    });
  }

  function createLessonCard(lesson: LessonItem, groupName: string): HTMLElement {
    const article = document.createElement("article");
    article.className = "lesson-card";
    article.innerHTML = `<div class="lesson-thumb lesson-thumb--violet"><button class="play-btn" aria-label="Assistir ${lesson.title}"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7Z"/></svg></button>${lesson.duration ? `<span class="lesson-duration">${lesson.duration}</span>` : ""}${lesson.badge ? `<span class="lesson-badge">${lesson.badge}</span>` : ""}</div><span class="lesson-tag">${groupName}</span><h3>${lesson.title}</h3><p class="lesson-teacher">${lesson.teacher ? `com ${lesson.teacher}` : lesson.level}</p>`;
    return article;
  }

  function createLessonGroup(group: LessonGroup): HTMLElement {
    const wrapper = document.createElement("section");
    wrapper.className = "lesson-group";
    wrapper.dataset.instrument = group.instrument_slug;

    const head = document.createElement("div");
    head.className = "lesson-group-head";
    head.innerHTML = `<h3>${group.instrument_name}</h3>${group.is_primary ? '<span class="lesson-group-tag">Seu instrumento</span>' : ""}`;

    const row = document.createElement("div");
    row.className = "lesson-row";
    row.replaceChildren(...group.lessons.map((lesson) => createLessonCard(lesson, group.instrument_name)));

    wrapper.append(head, row);
    return wrapper;
  }

  function renderLessonGroups(groups: LessonGroup[]): void {
    const container = document.getElementById("lessonGroups");
    const section = document.getElementById("lessons");
    const tabs = document.getElementById("filterTabs");
    if (!container || !tabs) return;

    if (!groups.length) {
      section?.setAttribute("hidden", "");
      return;
    }
    section?.removeAttribute("hidden");
    container.replaceChildren(...groups.map((group) => createLessonGroup(group)));

    const tabButtons = [
      { slug: "all", label: "Todas" },
      ...groups.map((group) => ({ slug: group.instrument_slug, label: group.instrument_name })),
    ];
    tabs.replaceChildren(...tabButtons.map((tab, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `filter-tab${index === 0 ? " active" : ""}`;
      button.dataset.filter = tab.slug;
      button.textContent = tab.label;
      return button;
    }));
  }

  function createInstrumentCard(item: NonNullable<HomepageData["instruments"]>[number]): HTMLElement {
    const link = document.createElement("a");
    link.className = "instrument-card";
    link.href = `#lessons`;
    link.innerHTML = `<span class="instrument-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${getInstrumentSvg(item.icon)}</svg></span><h3>${item.name}</h3><span class="instrument-meta">${item.meta}</span>`;
    return link;
  }

  function getInstrumentSvg(icon: string): string {
    const map: Record<string, string> = {
      violao: '<path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
      piano: '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M7 6v12M11 6v12M15 6v12"/>',
      bateria: '<ellipse cx="12" cy="8" rx="7" ry="3"/><path d="M5 8v7a7 3 0 0 0 14 0V8"/><path d="M12 15v4"/>',
      violino: '<path d="M12 3c2.5 0 3 1.6 3 3s-1 2-1 3.5c2 .5 3.5 2.5 3.5 5A5.5 5.5 0 1 1 6.5 9c1.5 0 2-1 2-2 0-1.4.5-4 3.5-4Z"/><circle cx="12" cy="14.5" r="1.4"/>',
      ukulele: '<path d="M10 17V7l6-1.2V15"/><circle cx="7.5" cy="17" r="2.5"/><circle cx="14" cy="15" r="2.5"/>',
      canto: '<rect x="9" y="3" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M9.5 20.5h5"/>',
      guitarra: '<path d="M12 3c3 0 5.5 2.7 5.5 7 0 5-3 9-5.5 11-2.5-2-5.5-6-5.5-11C6.5 5.7 9 3 12 3Z"/><path d="M12 4v8"/>',
      composicao: '<path d="M4 20l4-1 9-9-3-3-9 9-1 4Z"/><path d="M13 8l3-3"/>',
    };
    return map[icon] || map.violao;
  }

  function renderHomepage(data: HomepageData): void {
    if (!data.success) return;
    const user = data.user || { email: "" };
    const hero = data.hero || {};
    const journey = data.journey || {};
    const displayName = user.name || "Aluno";

    setText(".user-name", displayName);
    const userAvatar = document.querySelector<HTMLElement>("#userChip .avatar");
    if (userAvatar) userAvatar.textContent = getInitial(displayName);
    updateTimeContext(displayName);

    renderLessonGroups(data.lesson_groups || []);

    const instrumentGrid = document.getElementById("instrumentGrid");
    if (instrumentGrid && data.instruments) {
      instrumentGrid.replaceChildren(...data.instruments.map((item) => createInstrumentCard(item)));
    }

    if (journey.level) setText(".level-ring-inner b", String(journey.level));
    if (journey.xp_needed !== undefined && journey.level) setText(".level-info p", `Faltam ${journey.xp_needed} XP para o nível ${journey.level + 1} — continue praticando para desbloquear o desafio semanal.`);
    const levelProgress = document.querySelector<HTMLElement>(".level-info .progress-fill");
    if (levelProgress) levelProgress.style.width = `${journey.progress || 0}%`;
    if (journey.xp_current !== undefined && journey.xp_goal) setText(".level-info .progress-label", `${journey.xp_current} / ${journey.xp_goal} XP`);

    const stats = hero.stats || [];
    stats.forEach((stat) => {
      const statPill = Array.from(document.querySelectorAll<HTMLElement>(".stat-pill")).find((pill) => pill.textContent?.includes(stat.label));
      if (statPill) statPill.querySelector("b")!.textContent = stat.label === "Nível" ? `Nível ${stat.value}` : stat.value;
    });
    setText(".streak-note", journey.streak ? `Pratique hoje para manter os ${journey.streak} dias seguidos.` : "Pratique hoje para começar sua sequência.");
    if (journey.weekly_sequence) document.querySelectorAll<HTMLElement>(".streak-day").forEach((day, index) => day.classList.toggle("is-done", Boolean(journey.weekly_sequence?.[index])));
    if (journey.badges) document.querySelectorAll<HTMLElement>(".badges-grid .badge").forEach((badge, index) => badge.classList.toggle("is-locked", !journey.badges?.[index]?.unlocked));

    const leaderboard = document.querySelector<HTMLOListElement>(".leaderboard-list");
    if (leaderboard) {
      const ranking = journey.ranking || [];
      if (ranking.length) {
        leaderboard.replaceChildren(...ranking.map((entry) => {
          const item = document.createElement("li");
          if (entry.is_you) item.className = "is-you";
          const avatar = entry.is_you ? getInitial(displayName) : entry.avatar;
          const rankingName = entry.is_you ? `${displayName} (você)` : entry.name;
          item.innerHTML = `<span class="rank">${entry.rank}</span><span class="avatar avatar--sm">${avatar}</span><span class="lb-name">${rankingName}</span><span class="lb-xp">${entry.xp} XP</span>`;
          return item;
        }));
      } else {
        leaderboard.innerHTML = '<li class="leaderboard-empty">Pratique para aparecer no ranking.</li>';
      }
    }
  }

  function animateProgress(): void {
    document.querySelectorAll<HTMLElement>(".progress-fill[data-progress]").forEach((bar) => {
      requestAnimationFrame(() => { bar.style.width = `${bar.dataset.progress || 0}%`; });
    });
  }

  async function tryRefreshSession(user: StoredUser): Promise<StoredUser | null> {
    if (!user.refresh_token) return null;
    try {
      const response = await fetch(`${API_URL}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: user.refresh_token }),
      });
      const data = await response.json() as { success?: boolean; access_token?: string; refresh_token?: string };
      if (!response.ok || !data.success || !data.access_token) return null;
      const updated: StoredUser = { ...user, access_token: data.access_token, refresh_token: data.refresh_token || user.refresh_token };
      saveUser(updated);
      return updated;
    } catch {
      return null;
    }
  }

  async function fetchHomepage(token: string): Promise<Response> {
    return fetch(`${API_URL}/homepage`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  }

  async function loadHomepage(): Promise<void> {
    let user = getUserFromStorage();
    if (!user || !user.access_token) {
      goToLogin();
      return;
    }
    try {
      let response = await fetchHomepage(user.access_token);
      if (response.status === 401) {
        const refreshed = await tryRefreshSession(user);
        if (!refreshed) { goToLogin(); return; }
        user = refreshed;
        response = await fetchHomepage(user.access_token!);
      }
      if (response.status === 401) { goToLogin(); return; }
      const data = await response.json() as HomepageData;
      if (!data.success) {
        console.error("Não foi possível carregar a homepage:", data.message);
        return;
      }
      renderHomepage(data);
      animateProgress();
    } catch (error) {
      console.error("Erro ao carregar homepage:", error);
    }
  }

  window.setInterval(() => {
    const user = getUserFromStorage();
    if (user) updateTimeContext(user.name || "Usuário");
  }, 60_000);

  document.getElementById("navToggle")?.addEventListener("click", () => {
    const nav = document.getElementById("navLinks");
    const toggle = document.getElementById("navToggle");
    if (!nav || !toggle) return;
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  document.getElementById("filterTabs")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>(".filter-tab");
    if (!button) return;
    document.querySelectorAll(".filter-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
    const filter = button.dataset.filter || "all";
    document.querySelectorAll<HTMLElement>(".lesson-group").forEach((group) => {
      group.classList.toggle("is-hidden", filter !== "all" && group.dataset.instrument !== filter);
    });
  });

  const userChip = document.getElementById("userChip");
  const userMenu = document.getElementById("userMenu");
  const closeUserMenu = (): void => { userMenu?.classList.remove("is-open"); userChip?.setAttribute("aria-expanded", "false"); };
  userChip?.addEventListener("click", () => {
    const isOpen = userMenu?.classList.toggle("is-open") || false;
    userChip.setAttribute("aria-expanded", String(isOpen));
  });
  document.getElementById("logoutButton")?.addEventListener("click", () => { goToLogin(); });
  document.addEventListener("click", (event) => {
    if (!(event.target as Node).parentElement?.closest(".user-menu-wrap")) closeUserMenu();
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeUserMenu(); });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { loadHomepage(); });
  else loadHomepage();
})();
