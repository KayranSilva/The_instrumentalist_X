"use strict";
// Tela "Planos" do painel administrativo. O admin.ts chama AdminPlans.load()
// quando o administrador abre #planos. Só administradores veem esta tela.
const AdminPlans = (() => {
    "use strict";
    const esc = AppSession.escapeHtml;
    const $ = (id) => document.getElementById(id);
    const PERIOD_LABEL = { monthly: "Mensal", quarterly: "Trimestral", semiannual: "Semestral", annual: "Anual" };
    const PERIOD_DAYS = { monthly: 30, quarterly: 90, semiannual: 180, annual: 365 };
    const SUBSCRIPTION_STATUS = { active: "Ativa", pending: "Pendente", failed: "Recusada", canceled: "Cancelada", expired: "Expirada" };
    const PAYMENT_STATUS = { approved: "Aprovado", rejected: "Recusado", pending: "Pendente", canceled: "Cancelado" };
    const METHOD_LABEL = { pix: "Pix", credit_card: "Cartão de crédito" };
    const GOOD = ["active", "approved"];
    const WAITING = ["pending"];
    const BAD = ["failed", "rejected"];
    const form = $("planForm");
    const nameInput = $("planName");
    const descriptionInput = $("planDescription");
    const priceInput = $("planPrice");
    const periodSelect = $("planPeriod");
    const durationInput = $("planDuration");
    const featuresInput = $("planFeatures");
    const activeInput = $("planActive");
    const featuredInput = $("planFeatured");
    const submitButton = $("planSubmit");
    const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    let plans = [];
    let subscriptions = [];
    let payments = [];
    let editing = null;
    let durationTouched = false;
    let activeTab = "subscriptions";
    let busy = false;
    let loaded = false;
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
        const feedback = $("planFeedback");
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
    function formatDateTime(value) {
        if (!value)
            return "—";
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? "—"
            : date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    function statusPill(status, labels) {
        const tone = GOOD.includes(status) ? "ok" : WAITING.includes(status) ? "warn" : BAD.includes(status) ? "bad" : "neutral";
        return `<span class="status-pill status-pill--${tone}">${esc(labels[status] || status)}</span>`;
    }
    function featuresFromText() {
        return featuresInput.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    }
    // ---------- Resumo ----------
    function renderStats() {
        const activePlans = plans.filter((plan) => plan.is_active).length;
        const inactivePlans = plans.length - activePlans;
        $("planActiveCount").textContent = String(activePlans);
        $("planInactiveNote").textContent = inactivePlans
            ? `+ ${inactivePlans} ${inactivePlans === 1 ? "inativo" : "inativos"}`
            : "visíveis para os alunos";
        const activeSubscriptions = subscriptions.filter((item) => item.status === "active").length;
        $("subActiveCount").textContent = String(activeSubscriptions);
        $("subTotalNote").textContent = `de ${subscriptions.length} ${subscriptions.length === 1 ? "contratação" : "contratações"}`;
        const approved = payments.filter((item) => item.status === "approved");
        $("payApprovedTotal").textContent = money.format(approved.reduce((sum, item) => sum + Number(item.amount || 0), 0));
        $("payApprovedNote").textContent = `${approved.length} ${approved.length === 1 ? "pagamento aprovado" : "pagamentos aprovados"}`;
    }
    // ---------- Lista de planos ----------
    function renderPlans() {
        const list = $("planList");
        $("planCount").textContent = `${plans.length} ${plans.length === 1 ? "plano" : "planos"}`;
        if (!plans.length) {
            list.innerHTML = '<div class="empty-state"><span>$</span><p>Nenhum plano cadastrado ainda. Use o formulário ao lado para criar o primeiro.</p></div>';
            return;
        }
        list.innerHTML = plans.map((plan) => {
            const meta = [
                PERIOD_LABEL[plan.billing_period] || plan.billing_period,
                `${plan.duration_days} ${plan.duration_days === 1 ? "dia" : "dias"}`,
                `${plan.features.length} ${plan.features.length === 1 ? "benefício" : "benefícios"}`,
            ].map(esc).join(" · ");
            const pills = (plan.is_active ? "" : ' <span class="draft-pill">Inativo</span>')
                + (plan.is_featured ? ' <span class="exercise-pill">Destaque</span>' : "");
            return `<article class="content-item${(editing === null || editing === void 0 ? void 0 : editing.id) === plan.id ? " is-editing" : ""}">`
                + `<span class="content-symbol plan${plan.is_active ? "" : " is-off"}" aria-hidden="true">R$</span>`
                + `<div class="content-body"><h3 class="content-title">${esc(plan.name)}${pills}</h3>`
                + `<p class="content-meta">${esc(money.format(plan.price))} · ${meta}</p></div>`
                + `<div class="content-actions">`
                + `<button class="text-button" type="button" data-plan-edit="${esc(plan.id)}">Editar</button>`
                + `<button class="text-button" type="button" data-plan-toggle="${esc(plan.id)}">${plan.is_active ? "Desativar" : "Ativar"}</button>`
                + `</div></article>`;
        }).join("");
    }
    // ---------- Assinaturas e pagamentos ----------
    function renderHistory() {
        const body = $("planHistoryBody");
        const head = $("planHistoryHead");
        document.querySelectorAll(".plan-tab").forEach((tab) => {
            const active = tab.dataset.tab === activeTab;
            tab.classList.toggle("active", active);
            tab.setAttribute("aria-selected", String(active));
        });
        if (activeTab === "subscriptions") {
            $("planHistoryCount").textContent = `${subscriptions.length} ${subscriptions.length === 1 ? "assinatura" : "assinaturas"}`;
            head.innerHTML = "<tr><th>Aluno</th><th>Plano</th><th>Valor</th><th>Situação</th><th>Início</th><th>Fim</th></tr>";
            if (!subscriptions.length) {
                body.innerHTML = '<tr><td colspan="6" class="table-empty">Nenhuma assinatura ainda.</td></tr>';
                return;
            }
            body.innerHTML = subscriptions.map((item) => `<tr>`
                + `<td data-label="Aluno"><b>${esc(item.student_name)}</b></td>`
                + `<td data-label="Plano">${esc(item.plan_name_snapshot)}<br><small class="muted">${esc(PERIOD_LABEL[item.billing_period_snapshot] || item.billing_period_snapshot)}</small></td>`
                + `<td data-label="Valor">${esc(money.format(Number(item.amount_snapshot)))}</td>`
                + `<td data-label="Situação">${statusPill(item.status, SUBSCRIPTION_STATUS)}</td>`
                + `<td data-label="Início">${esc(formatDate(item.start_date))}</td>`
                + `<td data-label="Fim">${esc(formatDate(item.end_date))}</td>`
                + `</tr>`).join("");
            return;
        }
        $("planHistoryCount").textContent = `${payments.length} ${payments.length === 1 ? "pagamento" : "pagamentos"}`;
        head.innerHTML = "<tr><th>Aluno</th><th>Plano</th><th>Valor</th><th>Forma</th><th>Situação</th><th>Data</th></tr>";
        if (!payments.length) {
            body.innerHTML = '<tr><td colspan="6" class="table-empty">Nenhum pagamento ainda.</td></tr>';
            return;
        }
        body.innerHTML = payments.map((item) => `<tr>`
            + `<td data-label="Aluno"><b>${esc(item.student_name)}</b></td>`
            + `<td data-label="Plano">${esc(item.plan_name)}</td>`
            + `<td data-label="Valor">${esc(money.format(Number(item.amount)))}</td>`
            + `<td data-label="Forma">${esc(METHOD_LABEL[item.payment_method] || item.payment_method)}</td>`
            + `<td data-label="Situação">${statusPill(item.status, PAYMENT_STATUS)}</td>`
            + `<td data-label="Data">${esc(formatDateTime(item.created_at))}</td>`
            + `</tr>`).join("");
    }
    // ---------- Carregamento ----------
    async function loadPlans() {
        try {
            const data = await AppSession.api("/admin/plans");
            plans = (data.plans || []).map((plan) => (Object.assign(Object.assign({}, plan), { features: Array.isArray(plan.features) ? plan.features : [] })));
            renderPlans();
        }
        catch (error) {
            $("planList").innerHTML = `<div class="empty-state"><span>!</span><p>${esc(errorMessage(error, "Não foi possível carregar os planos."))}</p></div>`;
        }
    }
    async function loadSubscriptions() {
        try {
            const data = await AppSession.api("/admin/subscriptions");
            subscriptions = data.subscriptions || [];
        }
        catch (error) {
            subscriptions = [];
            if (activeTab === "subscriptions")
                $("planHistoryBody").innerHTML = `<tr><td colspan="6" class="table-empty">${esc(errorMessage(error, "Não foi possível carregar as assinaturas."))}</td></tr>`;
            return;
        }
        renderHistory();
    }
    async function loadPayments() {
        try {
            const data = await AppSession.api("/admin/payments");
            payments = data.payments || [];
        }
        catch (error) {
            payments = [];
            if (activeTab === "payments")
                $("planHistoryBody").innerHTML = `<tr><td colspan="6" class="table-empty">${esc(errorMessage(error, "Não foi possível carregar os pagamentos."))}</td></tr>`;
            return;
        }
        renderHistory();
    }
    async function load(force = false) {
        if (loaded && !force)
            return;
        loaded = true;
        await Promise.all([loadPlans(), loadSubscriptions(), loadPayments()]);
        renderStats();
    }
    // ---------- Formulário ----------
    function resetForm() {
        editing = null;
        durationTouched = false;
        form.reset();
        activeInput.checked = true;
        featuredInput.checked = false;
        periodSelect.value = "monthly";
        durationInput.value = String(PERIOD_DAYS.monthly);
        $("planFormEyebrow").textContent = "Novo plano";
        $("planFormTitle").textContent = "Cadastrar plano";
        $("planSubmitLabel").textContent = "Cadastrar plano";
        $("planCancelEdit").hidden = true;
        setFeedback("");
    }
    function startEdit(plan) {
        editing = plan;
        durationTouched = true;
        nameInput.value = plan.name;
        descriptionInput.value = plan.description;
        priceInput.value = String(plan.price);
        periodSelect.value = plan.billing_period;
        durationInput.value = String(plan.duration_days);
        featuresInput.value = plan.features.join("\n");
        activeInput.checked = plan.is_active;
        featuredInput.checked = plan.is_featured;
        $("planFormEyebrow").textContent = "Editando";
        $("planFormTitle").textContent = "Editar plano";
        $("planSubmitLabel").textContent = "Salvar alterações";
        $("planCancelEdit").hidden = false;
        setFeedback("");
        renderPlans();
        $("planFormPanel").scrollIntoView({ behavior: "smooth", block: "start" });
        nameInput.focus({ preventScroll: true });
    }
    function validate() {
        if (!nameInput.value.trim())
            return "Informe o nome do plano.";
        const raw = priceInput.value.trim().replace(",", ".");
        const price = Number(raw);
        if (!raw || !Number.isFinite(price) || price < 0)
            return "Informe um preço válido (zero ou mais).";
        if (Math.round(price * 100) / 100 !== price)
            return "Use no máximo duas casas decimais no preço.";
        const days = Number(durationInput.value);
        if (!Number.isInteger(days) || days < 1 || days > 3650)
            return "A duração deve ser um número inteiro de 1 a 3650 dias.";
        const features = featuresFromText();
        if (features.length > 12)
            return "Cadastre no máximo 12 benefícios.";
        if (features.some((item) => item.length > 120))
            return "Cada benefício pode ter no máximo 120 caracteres.";
        return null;
    }
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy)
            return;
        setFeedback("");
        const problem = validate();
        if (problem) {
            setFeedback(problem, true);
            return;
        }
        const payload = {
            name: nameInput.value.trim(),
            description: descriptionInput.value.trim(),
            price: priceInput.value.trim().replace(",", "."),
            billing_period: periodSelect.value,
            duration_days: Number(durationInput.value),
            features: featuresFromText(),
            is_active: activeInput.checked,
            is_featured: featuredInput.checked,
        };
        busy = true;
        submitButton.disabled = true;
        try {
            const path = editing ? `/admin/plans/${encodeURIComponent(editing.id)}` : "/admin/plans";
            const result = await AppSession.api(path, { method: editing ? "PATCH" : "POST", json: payload });
            toast(result.message || "Plano salvo.");
            resetForm();
            await loadPlans();
            renderStats();
        }
        catch (error) {
            setFeedback(errorMessage(error, "Não foi possível salvar o plano."), true);
        }
        finally {
            busy = false;
            submitButton.disabled = false;
        }
    });
    periodSelect.addEventListener("change", () => {
        if (!durationTouched)
            durationInput.value = String(PERIOD_DAYS[periodSelect.value] || 30);
    });
    durationInput.addEventListener("input", () => { durationTouched = true; });
    $("planCancelEdit").addEventListener("click", () => { resetForm(); renderPlans(); });
    // ---------- Ações da lista ----------
    $("planList").addEventListener("click", async (event) => {
        const target = event.target;
        const editButton = target.closest("[data-plan-edit]");
        if (editButton) {
            const plan = plans.find((item) => item.id === editButton.dataset.planEdit);
            if (plan)
                startEdit(plan);
            return;
        }
        const toggleButton = target.closest("[data-plan-toggle]");
        if (!toggleButton)
            return;
        const plan = plans.find((item) => item.id === toggleButton.dataset.planToggle);
        if (!plan)
            return;
        if (plan.is_active && !window.confirm(`Desativar "${plan.name}"? Ele deixa de aparecer para os alunos, mas as assinaturas já feitas continuam registradas.`))
            return;
        toggleButton.disabled = true;
        try {
            await AppSession.api(`/admin/plans/${encodeURIComponent(plan.id)}`, { method: "PATCH", json: { is_active: !plan.is_active } });
            toast(plan.is_active ? "Plano desativado." : "Plano ativado.");
            if ((editing === null || editing === void 0 ? void 0 : editing.id) === plan.id)
                resetForm();
            await loadPlans();
            renderStats();
        }
        catch (error) {
            toggleButton.disabled = false;
            toast(errorMessage(error, "Não foi possível alterar o plano."), "error");
        }
    });
    document.querySelectorAll(".plan-tab").forEach((tab) => tab.addEventListener("click", () => {
        activeTab = tab.dataset.tab || "subscriptions";
        renderHistory();
    }));
    $("refreshPlansBtn").addEventListener("click", () => { load(true); });
    resetForm();
    return { load };
})();
