"use strict";
(() => {
    "use strict";
    var _a;
    const API_URL = window.location.protocol === "file:" ? "http://localhost:8001" : window.location.origin;
    const keyInput = document.getElementById("adminKey");
    const form = document.getElementById("contentForm");
    const accessForm = document.getElementById("accessForm");
    const accessKey = document.getElementById("accessKey");
    const accessGate = document.getElementById("accessGate");
    const accessFeedback = document.getElementById("accessFeedback");
    const feedback = document.getElementById("formFeedback");
    const list = document.getElementById("contentList");
    let contents = [];
    let activeFilter = "todos";
    const getKey = () => (keyInput === null || keyInput === void 0 ? void 0 : keyInput.value.trim()) || "";
    const setFeedback = (message, error = false) => { feedback.textContent = message; feedback.classList.toggle("error", error); };
    const typeLabel = (type) => ({ aula: "Aula", musica: "Música", partitura: "Partitura" }[type]);
    const typeSymbol = (type) => ({ aula: "▶", musica: "♪", partitura: "♫" }[type]);
    const escapeHtml = (value) => value.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] || char));
    function renderList() {
        const visible = activeFilter === "todos" ? contents : contents.filter(item => item.type === activeFilter);
        document.getElementById("visibleCount").textContent = `${visible.length} ${visible.length === 1 ? "item" : "itens"}`;
        if (!visible.length) {
            list.innerHTML = '<div class="empty-state"><span>♪</span><p>Nenhum conteúdo neste filtro.</p></div>';
            return;
        }
        list.innerHTML = visible.map(item => `<article class="content-item"><span class="content-symbol ${item.type}">${typeSymbol(item.type)}</span><div><h3 class="content-title">${escapeHtml(item.title)}</h3><p class="content-meta">${typeLabel(item.type)} · ${escapeHtml(item.instrument)} · ${escapeHtml(item.level)}</p></div><div><a class="content-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Abrir ↗</a><button class="delete-button" data-delete="${escapeHtml(item.id)}" type="button" aria-label="Remover ${escapeHtml(item.title)}">×</button></div></article>`).join("");
    }
    async function request(path, options = {}) {
        const headers = new Headers(options.headers);
        headers.set("X-Admin-Key", getKey());
        const response = await fetch(API_URL + path, Object.assign(Object.assign({}, options), { headers }));
        const data = await response.json();
        if (!response.ok)
            throw new Error(data.message || "Não foi possível concluir a operação.");
        return data;
    }
    async function loadContents() {
        if (!getKey()) {
            list.innerHTML = '<div class="empty-state"><span>⌐</span><p>Digite a chave de acesso para carregar o catálogo.</p></div>';
            keyInput === null || keyInput === void 0 ? void 0 : keyInput.focus();
            return;
        }
        try {
            const data = await request("/admin/content");
            contents = data.content || [];
            renderList();
            document.getElementById("totalCount").textContent = String(contents.length);
            document.getElementById("lessonCount").textContent = String(contents.filter(item => item.type === "aula").length);
            document.getElementById("materialCount").textContent = String(contents.filter(item => item.type !== "aula").length);
        }
        catch (error) {
            list.innerHTML = `<div class="empty-state"><span>!</span><p>${error instanceof Error ? escapeHtml(error.message) : "Não foi possível carregar o catálogo."}</p></div>`;
        }
    }
    accessForm === null || accessForm === void 0 ? void 0 : accessForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const key = accessKey.value.trim();
        if (!key)
            return;
        keyInput.value = key;
        accessFeedback.textContent = "Verificando acesso...";
        try {
            await request("/admin/content");
            accessGate.remove();
            await loadContents();
        }
        catch (error) {
            accessFeedback.textContent = error instanceof Error ? error.message : "Chave de acesso inválida.";
            accessKey.select();
        }
    });
    document.querySelectorAll(".type-option").forEach(button => button.addEventListener("click", () => {
        document.querySelectorAll(".type-option").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        document.getElementById("contentType").value = button.dataset.type || "aula";
        const type = button.dataset.type;
        const resourceField = document.getElementById("resourceField");
        const urlField = document.getElementById("urlField");
        const resource = document.getElementById("resource");
        const linkLabel = type === "partitura" ? "Link do PDF <i>*</i>" : "Link da música <i>*</i>";
        document.getElementById("urlLabel").innerHTML = type === "aula" ? "Arquivo da aula <i>*</i>" : linkLabel;
        resourceField.style.display = type === "aula" ? "block" : "none";
        urlField.style.display = type === "aula" ? "none" : "block";
        resource.required = type === "aula";
        const url = document.getElementById("url");
        if (url)
            url.required = type !== "aula";
        document.getElementById("durationField").style.display = type === "partitura" ? "none" : "block";
    }));
    document.querySelectorAll(".filter-button").forEach(button => button.addEventListener("click", () => { document.querySelectorAll(".filter-button").forEach(item => item.classList.remove("active")); button.classList.add("active"); activeFilter = button.dataset.filter || "todos"; renderList(); }));
    (_a = document.getElementById("refreshBtn")) === null || _a === void 0 ? void 0 : _a.addEventListener("click", loadContents);
    keyInput === null || keyInput === void 0 ? void 0 : keyInput.addEventListener("change", loadContents);
    list === null || list === void 0 ? void 0 : list.addEventListener("click", async (event) => { const button = event.target.closest("[data-delete]"); if (!button || !window.confirm("Remover este conteúdo do catálogo?"))
        return; try {
        await request(`/admin/content/${button.dataset.delete}`, { method: "DELETE" });
        await loadContents();
    }
    catch (error) {
        setFeedback(error instanceof Error ? error.message : "Não foi possível remover o conteúdo.", true);
    } });
    form === null || form === void 0 ? void 0 : form.addEventListener("submit", async (event) => { var _a; event.preventDefault(); setFeedback(""); if (!form.checkValidity()) {
        form.reportValidity();
        return;
    } const payload = new FormData(form); payload.set("type", document.getElementById("contentType").value); try {
        await request("/admin/content", { method: "POST", body: payload });
        form.reset();
        (_a = document.querySelector(".type-option[data-type='aula']")) === null || _a === void 0 ? void 0 : _a.click();
        setFeedback("Conteúdo publicado com sucesso.");
        await loadContents();
    }
    catch (error) {
        setFeedback(error instanceof Error ? error.message : "Não foi possível publicar.", true);
    } });
    accessKey === null || accessKey === void 0 ? void 0 : accessKey.focus();
})();
