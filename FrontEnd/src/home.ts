(() => {
  "use strict";

  const API_URL = `http://${window.location.hostname}:8001`;
  type StoredUser = { email: string; name?: string };
  type HomepageData = {
    success: boolean;
    user?: StoredUser;
    hero?: {
      greeting?: string;
      message?: string;
      continue_lesson?: {
        instrument: string;
        module: string;
        title: string;
        progress: number;
        time_remaining: string;
      };
    };
    lessons?: Array<{ instrument: string; title: string; teacher: string; duration: string; progress: number; badge?: string | null }>;
    instruments?: Array<{ name: string; meta: string; icon: string }>;
    journey?: { level?: number; xp_needed?: number; progress?: number; xp_current?: number; xp_goal?: number; ranking?: Array<{ rank: number; name: string; xp: number; avatar: string; is_you?: boolean }> };
  };

  function getUserFromStorage(): StoredUser | null {
    try {
      const user: unknown = JSON.parse(localStorage.getItem("theInstrumentalistUser") || "null");
      return user && typeof user === "object" && "email" in user && typeof user.email === "string" ? user as StoredUser : null;
    } catch {
      return null;
    }
  }

  function setText(selector: string, value: string): void {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  }

  function renderHomepage(data: HomepageData): void {
    if (!data.success) return;
    const user = data.user || {};
    const hero = data.hero || {};
    const lesson = hero.continue_lesson;
    const journey = data.journey || {};

    setText(".user-name", user.name || "Marina");
    if (hero.greeting) setText(".hero-greet h1", hero.greeting);
    if (hero.message) setText(".hero-greet p", hero.message);

    if (lesson) {
      setText(".continue-info .tag", `${lesson.instrument} · ${lesson.module}`);
      setText(".continue-info h3", lesson.title);
      setText(".continue-info .progress-label", `${lesson.progress}% concluído · ${lesson.time_remaining}`);
      const progress = document.querySelector<HTMLElement>(".continue-info .progress-fill");
      if (progress) progress.style.width = `${lesson.progress}%`;
    }

    const lessonRow = document.getElementById("lessonRow");
    if (lessonRow && data.lessons) {
      lessonRow.replaceChildren(...data.lessons.map((item) => createLessonCard(item)));
    }

    const instrumentGrid = document.querySelector<HTMLElement>(".instrument-grid");
    if (instrumentGrid && data.instruments) {
      instrumentGrid.replaceChildren(...data.instruments.map((item) => createInstrumentCard(item)));
    }

    if (journey.level) setText(".level-ring-inner b", String(journey.level));
    if (journey.xp_needed && journey.level) setText(".level-info p", `Faltam ${journey.xp_needed} XP para o nível ${journey.level + 1} — continue praticando para desbloquear o desafio semanal.`);
    if (journey.progress) {
      const progress = document.querySelector<HTMLElement>(".level-info .progress-fill");
      if (progress) progress.style.width = `${journey.progress}%`;
    }
    if (journey.xp_current && journey.xp_goal) setText(".level-info .progress-label", `${journey.xp_current} / ${journey.xp_goal} XP`);

    const leaderboard = document.querySelector<HTMLOListElement>(".leaderboard-list");
    if (leaderboard && journey.ranking) {
      leaderboard.replaceChildren(...journey.ranking.map((entry) => {
        const item = document.createElement("li");
        if (entry.is_you) item.className = "is-you";
        item.innerHTML = `<span class="rank">${entry.rank}</span><span class="avatar avatar--sm">${entry.avatar}</span><span class="lb-name">${entry.name}</span><span class="lb-xp">${entry.xp} XP</span>`;
        return item;
      }));
    }
  }

  function createLessonCard(lesson: NonNullable<HomepageData["lessons"]>[number]): HTMLElement {
    const article = document.createElement("article");
    article.className = "lesson-card";
    article.dataset.instrument = lesson.instrument;
    const theme = lesson.instrument === "piano" ? "teal" : lesson.instrument === "bateria" ? "yellow" : "violet";
    const instrumentNames: Record<string, string> = { violao: "Violão", piano: "Piano", bateria: "Bateria", canto: "Canto" };
    article.innerHTML = `<div class="lesson-thumb lesson-thumb--${theme}"><button class="play-btn" aria-label="Assistir ${lesson.title}"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7Z"/></svg></button><span class="lesson-duration">${lesson.duration}</span>${lesson.badge ? `<span class="lesson-badge">${lesson.badge}</span>` : ""}</div><span class="lesson-tag">${instrumentNames[lesson.instrument] || "Instrumento"}</span><h3>${lesson.title}</h3><p class="lesson-teacher">com ${lesson.teacher}</p><div class="progress-track progress-track--sm"><div class="progress-fill" data-progress="${lesson.progress}" style="width:0%"></div></div>`;
    return article;
  }

  function createInstrumentCard(item: NonNullable<HomepageData["instruments"]>[number]): HTMLElement {
    const link = document.createElement("a");
    link.className = "instrument-card";
    link.href = "#lessons";
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
      canto: '<path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
    };
    return map[icon] || map.violao;
  }

  function animateProgress(): void {
    document.querySelectorAll<HTMLElement>(".progress-fill[data-progress]").forEach((bar) => {
      requestAnimationFrame(() => { bar.style.width = `${bar.dataset.progress || 0}%`; });
    });
  }

  async function loadHomepage(): Promise<void> {
    const user = getUserFromStorage();
    try {
      const response = await fetch(`${API_URL}/homepage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user?.email || "marina@theinstrumentalist.com" }) });
      renderHomepage(await response.json() as HomepageData);
    } catch (error) {
      console.error("Erro ao carregar homepage:", error);
    }
  }

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
    document.querySelectorAll<HTMLElement>(".lesson-card").forEach((card) => card.classList.toggle("is-hidden", filter !== "all" && card.dataset.instrument !== filter));
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { animateProgress(); loadHomepage(); });
  else { animateProgress(); loadHomepage(); }
})();
