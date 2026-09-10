(() => {
  "use strict";

  type ContentType = "aula" | "musica" | "partitura";
  type Content = { id: string; type: ContentType; title: string; instrument: string; description: string; url: string; teacher: string; duration: string; level: string; };
  const API_URL = window.location.protocol === "file:" ? "http://localhost:8001" : window.location.origin;
  const keyInput = document.getElementById("adminKey") as HTMLInputElement;
  const form = document.getElementById("contentForm") as HTMLFormElement;
  const accessForm = document.getElementById("accessForm") as HTMLFormElement;
  const accessKey = document.getElementById("accessKey") as HTMLInputElement;
  const accessGate = document.getElementById("accessGate") as HTMLElement;
  const accessFeedback = document.getElementById("accessFeedback") as HTMLParagraphElement;
  const feedback = document.getElementById("formFeedback") as HTMLParagraphElement;
  const list = document.getElementById("contentList") as HTMLDivElement;
  let contents: Content[] = [];
  let activeFilter = "todos";

  const getKey = () => keyInput?.value.trim() || "";
  const setFeedback = (message: string, error = false) => { feedback.textContent = message; feedback.classList.toggle("error", error); };
  const typeLabel = (type: ContentType) => ({ aula: "Aula", musica: "Música", partitura: "Partitura" }[type]);
  const typeSymbol = (type: ContentType) => ({ aula: "▶", musica: "♪", partitura: "♫" }[type]);
  const escapeHtml = (value: string) => value.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] || char));

  function renderList() {
    const visible = activeFilter === "todos" ? contents : contents.filter(item => item.type === activeFilter);
    document.getElementById("visibleCount")!.textContent = `${visible.length} ${visible.length === 1 ? "item" : "itens"}`;
    if (!visible.length) { list.innerHTML = '<div class="empty-state"><span>♪</span><p>Nenhum conteúdo neste filtro.</p></div>'; return; }
    list.innerHTML = visible.map(item => `<article class="content-item"><span class="content-symbol ${item.type}">${typeSymbol(item.type)}</span><div><h3 class="content-title">${escapeHtml(item.title)}</h3><p class="content-meta">${typeLabel(item.type)} · ${escapeHtml(item.instrument)} · ${escapeHtml(item.level)}</p></div><div><a class="content-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Abrir ↗</a><button class="delete-button" data-delete="${escapeHtml(item.id)}" type="button" aria-label="Remover ${escapeHtml(item.title)}">×</button></div></article>`).join("");
  }

  async function request(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers); headers.set("X-Admin-Key", getKey());
    const response = await fetch(API_URL + path, { ...options, headers });
    const data = await response.json(); if (!response.ok) throw new Error(data.message || "Não foi possível concluir a operação."); return data;
  }

  async function loadContents() {
    if (!getKey()) { list.innerHTML = '<div class="empty-state"><span>⌐</span><p>Digite a chave de acesso para carregar o catálogo.</p></div>'; keyInput?.focus(); return; }
    try { const data = await request("/admin/content"); contents = data.content || []; renderList(); document.getElementById("totalCount")!.textContent = String(contents.length); document.getElementById("lessonCount")!.textContent = String(contents.filter(item => item.type === "aula").length); document.getElementById("materialCount")!.textContent = String(contents.filter(item => item.type !== "aula").length); }
    catch (error) { list.innerHTML = `<div class="empty-state"><span>!</span><p>${error instanceof Error ? escapeHtml(error.message) : "Não foi possível carregar o catálogo."}</p></div>`; }
  }

  accessForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const key = accessKey.value.trim();
    if (!key) return;
    keyInput.value = key;
    accessFeedback.textContent = "Verificando acesso...";
    try {
      await request("/admin/content");
      accessGate.remove();
      await loadContents();
    } catch (error) {
      accessFeedback.textContent = error instanceof Error ? error.message : "Chave de acesso inválida.";
      accessKey.select();
    }
  });

  document.querySelectorAll<HTMLButtonElement>(".type-option").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll(".type-option").forEach(item => item.classList.remove("active")); button.classList.add("active");
    (document.getElementById("contentType") as HTMLInputElement).value = button.dataset.type || "aula";
    const type = button.dataset.type as ContentType;
    const resourceField = document.getElementById("resourceField")!;
    const urlField = document.getElementById("urlField")!;
    const resource = document.getElementById("resource") as HTMLInputElement;
    const isUpload = type === "aula" || type === "partitura";
    const linkLabel = type === "partitura" ? "Link do PDF <i>*</i>" : "Link da música <i>*</i>";
    document.getElementById("urlLabel")!.innerHTML = type === "aula" ? "Arquivo da aula <i>*</i>" : "Arquivo PDF da partitura <i>*</i>";
    resource.accept = type === "partitura" ? ".pdf,application/pdf" : "video/*,audio/*,.pdf,.png,.jpg,.jpeg";
    resourceField.style.display = isUpload ? "block" : "none";
    urlField.style.display = isUpload ? "none" : "block";
    resource.required = isUpload;
    const url = document.getElementById("url") as HTMLInputElement | null;
    if (url) url.required = !isUpload;
    document.getElementById("durationField")!.style.display = type === "partitura" ? "none" : "block";
  }));
  document.querySelectorAll<HTMLButtonElement>(".filter-button").forEach(button => button.addEventListener("click", () => { document.querySelectorAll(".filter-button").forEach(item => item.classList.remove("active")); button.classList.add("active"); activeFilter = button.dataset.filter || "todos"; renderList(); }));
  document.getElementById("refreshBtn")?.addEventListener("click", loadContents);
  keyInput?.addEventListener("change", loadContents);
  list?.addEventListener("click", async event => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-delete]"); if (!button || !window.confirm("Remover este conteúdo do catálogo?")) return; try { await request(`/admin/content/${button.dataset.delete}`, { method: "DELETE" }); await loadContents(); } catch (error) { setFeedback(error instanceof Error ? error.message : "Não foi possível remover o conteúdo.", true); } });
  form?.addEventListener("submit", async event => { event.preventDefault(); setFeedback(""); if (!form.checkValidity()) { form.reportValidity(); return; } const payload = new FormData(form); payload.set("type", (document.getElementById("contentType") as HTMLInputElement).value); try { await request("/admin/content", { method: "POST", body: payload }); form.reset(); document.querySelector<HTMLButtonElement>(".type-option[data-type='aula']")?.click(); setFeedback("Conteúdo publicado com sucesso."); await loadContents(); } catch (error) { setFeedback(error instanceof Error ? error.message : "Não foi possível publicar.", true); } });
  accessKey?.focus();
})();
