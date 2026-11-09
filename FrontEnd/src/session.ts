// Utilitários compartilhados por todas as páginas (carregado antes dos
// outros scripts). Sem bundler: o que é declarado aqui fica global.

type StoredUser = {
  id?: string;
  email: string;
  name?: string;
  role?: string;
  access_token?: string;
  refresh_token?: string;
};

class AppApiError extends Error {
  status: number;
  field?: string;

  constructor(message: string, status: number, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

const AppSession = (() => {
  "use strict";

  const API_URL = window.location.protocol === "file:" ? "http://localhost:8001" : window.location.origin;
  const USER_KEY = "theInstrumentalistUser";

  function storages(): Storage[] {
    const list: Storage[] = [];
    try { list.push(window.localStorage); } catch { /* bloqueado */ }
    try { list.push(window.sessionStorage); } catch { /* bloqueado */ }
    return list;
  }

  function readFrom(storage: Storage): StoredUser | null {
    try {
      const value: unknown = JSON.parse(storage.getItem(USER_KEY) || "null");
      if (value && typeof value === "object" && typeof (value as StoredUser).access_token === "string") {
        return value as StoredUser;
      }
    } catch { /* valor corrompido */ }
    return null;
  }

  function getUser(): StoredUser | null {
    for (const storage of storages()) {
      const user = readFrom(storage);
      if (user) return user;
    }
    return null;
  }

  /** "Lembrar de mim" = localStorage (sobrevive ao fechar o navegador);
   *  sem ele, sessionStorage. Sem `remember`, mantém onde já estava. */
  function saveUser(user: StoredUser, remember?: boolean): void {
    let persistent = remember;
    if (persistent === undefined) {
      try { persistent = Boolean(window.localStorage.getItem(USER_KEY)); } catch { persistent = false; }
    }
    clear();
    try {
      (persistent ? window.localStorage : window.sessionStorage).setItem(USER_KEY, JSON.stringify(user));
    } catch { /* armazenamento indisponível: a sessão dura só esta página */ }
  }

  function clear(): void {
    storages().forEach((storage) => { try { storage.removeItem(USER_KEY); } catch { /* ignore */ } });
  }

  function isStaff(user: StoredUser | null): boolean {
    return Boolean(user && (user.role === "admin" || user.role === "teacher"));
  }

  function goToLogin(reason?: "expired"): void {
    clear();
    window.location.replace(`login.html${reason ? `?${reason}=1` : ""}`);
  }

  /** Página que exige login: sem sessão, manda para o login. */
  function requireUser(): StoredUser | null {
    const user = getUser();
    if (!user) { goToLogin(); return null; }
    return user;
  }

  let refreshing: Promise<StoredUser | null> | null = null;

  function refresh(): Promise<StoredUser | null> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const user = getUser();
      if (!user?.refresh_token) return null;
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
    })().then((result) => { refreshing = null; return result; });
    return refreshing;
  }

  async function parse<T>(response: Response): Promise<T & { success?: boolean; message?: string; field?: string }> {
    try {
      return await response.json();
    } catch {
      return {} as T & { success?: boolean; message?: string };
    }
  }

  type ApiOptions = RequestInit & { auth?: boolean; json?: unknown };

  /** fetch para a API: põe o token, renova a sessão se expirou e
   *  transforma respostas de erro em AppApiError com mensagem pronta. */
  async function api<T = Record<string, unknown>>(path: string, options: ApiOptions = {}): Promise<T> {
    const { auth = true, json, ...init } = options;

    const send = (user: StoredUser | null) => {
      const headers = new Headers(init.headers);
      if (auth && user?.access_token) headers.set("Authorization", `Bearer ${user.access_token}`);
      let body = init.body;
      if (json !== undefined) { headers.set("Content-Type", "application/json"); body = JSON.stringify(json); }
      return fetch(API_URL + path, { ...init, headers, body });
    };

    let response: Response;
    try {
      response = await send(auth ? getUser() : null);
      if (auth && response.status === 401) {
        const refreshed = await refresh();
        if (!refreshed) { goToLogin("expired"); throw new AppApiError("Sessão expirada.", 401); }
        response = await send(refreshed);
        if (response.status === 401) { goToLogin("expired"); throw new AppApiError("Sessão expirada.", 401); }
      }
    } catch (error) {
      if (error instanceof AppApiError) throw error;
      throw new AppApiError("Não foi possível conectar ao servidor. Verifique sua internet.", 0);
    }

    const data = await parse<T>(response);
    if (!response.ok || data.success === false) {
      throw new AppApiError(data.message || "Não foi possível concluir a operação.", response.status, data.field);
    }
    return data;
  }

  /** Envio de arquivo com barra de progresso (fetch não informa progresso). */
  function upload<T = Record<string, unknown>>(
    path: string, method: string, body: FormData, onProgress?: (percent: number) => void,
  ): Promise<T> {
    const attempt = (user: StoredUser | null) => new Promise<{ status: number; data: T & { message?: string; success?: boolean } }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, API_URL + path);
      if (user?.access_token) xhr.setRequestHeader("Authorization", `Bearer ${user.access_token}`);
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
      });
      xhr.addEventListener("load", () => {
        let data = {} as T & { message?: string; success?: boolean };
        try { data = JSON.parse(xhr.responseText || "{}"); } catch { /* resposta vazia */ }
        resolve({ status: xhr.status, data });
      });
      xhr.addEventListener("error", () => reject(new AppApiError("Falha de conexão durante o envio.", 0)));
      xhr.send(body);
    });

    return (async () => {
      let result = await attempt(getUser());
      if (result.status === 401) {
        const refreshed = await refresh();
        if (!refreshed) { goToLogin("expired"); throw new AppApiError("Sessão expirada.", 401); }
        result = await attempt(refreshed);
      }
      if (result.status === 401) { goToLogin("expired"); throw new AppApiError("Sessão expirada.", 401); }
      if (result.status < 200 || result.status >= 300 || result.data.success === false) {
        throw new AppApiError(result.data.message || "Não foi possível concluir a operação.", result.status);
      }
      return result.data;
    })();
  }

  async function logout(): Promise<void> {
    const user = getUser();
    if (user?.access_token) {
      try {
        await fetch(`${API_URL}/logout`, { method: "POST", headers: { Authorization: `Bearer ${user.access_token}` } });
      } catch { /* sem rede: ainda assim encerramos localmente */ }
    }
    goToLogin();
  }

  function escapeHtml(value: unknown): string {
    return String(value ?? "").replace(/[&<>"']/g, (char) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char
    ));
  }

  function initial(name: string | undefined): string {
    return (name || "").trim().charAt(0).toUpperCase() || "•";
  }

  const INSTRUMENT_ICONS: Record<string, string> = {
    violao: '<path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
    piano: '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M7 6v12M11 6v12M15 6v12"/>',
    bateria: '<ellipse cx="12" cy="8" rx="7" ry="3"/><path d="M5 8v7a7 3 0 0 0 14 0V8"/><path d="M12 15v4"/>',
    violino: '<path d="M12 3c2.5 0 3 1.6 3 3s-1 2-1 3.5c2 .5 3.5 2.5 3.5 5A5.5 5.5 0 1 1 6.5 9c1.5 0 2-1 2-2 0-1.4.5-4 3.5-4Z"/><circle cx="12" cy="14.5" r="1.4"/>',
    ukulele: '<path d="M10 17V7l6-1.2V15"/><circle cx="7.5" cy="17" r="2.5"/><circle cx="14" cy="15" r="2.5"/>',
    canto: '<rect x="9" y="3" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M9.5 20.5h5"/>',
    guitarra: '<path d="M12 3c3 0 5.5 2.7 5.5 7 0 5-3 9-5.5 11-2.5-2-5.5-6-5.5-11C6.5 5.7 9 3 12 3Z"/><path d="M12 4v8"/>',
    composicao: '<path d="M4 20l4-1 9-9-3-3-9 9-1 4Z"/><path d="M13 8l3-3"/>',
  };

  function instrumentIcon(slug: string, size = 26): string {
    const paths = INSTRUMENT_ICONS[slug] || '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${paths}</svg>`;
  }

  /** Lista de instrumentos para cadastro/perfil, com reserva local caso a
   *  API esteja fora do ar (o servidor valida o slug de qualquer forma). */
  async function loadInstruments(): Promise<Array<{ slug: string; name: string }>> {
    try {
      const data = await api<{ instruments?: Array<{ slug: string; name: string }> }>("/instruments", { auth: false });
      if (data.instruments?.length) return data.instruments;
    } catch { /* usa a lista local */ }
    return [
      { slug: "bateria", name: "Bateria" },
      { slug: "canto", name: "Canto" },
      { slug: "composicao", name: "Composição" },
      { slug: "guitarra", name: "Guitarra" },
      { slug: "piano", name: "Piano" },
      { slug: "ukulele", name: "Ukulele" },
      { slug: "violao", name: "Violão" },
      { slug: "violino", name: "Violino" },
    ];
  }

  return {
    API_URL, getUser, saveUser, clear, isStaff, goToLogin, requireUser,
    api, upload, logout, escapeHtml, initial, instrumentIcon, loadInstruments,
  };
})();
