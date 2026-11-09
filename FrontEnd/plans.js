"use strict";
(() => {
    "use strict";
    const stored = AppSession.requireUser();
    if (!stored)
        return;
    const esc = AppSession.escapeHtml;
    const $ = (id) => document.getElementById(id);
    const sleep = (ms) => new Promise((resolve) => { window.setTimeout(resolve, ms); });
    const PERIOD_UNIT = { monthly: "mês", quarterly: "trimestre", semiannual: "semestre", annual: "ano" };
    const PERIOD_LABEL = { monthly: "Mensal", quarterly: "Trimestral", semiannual: "Semestral", annual: "Anual" };
    const SUBSCRIPTION_STATUS = { active: "Ativa", pending: "Pendente", failed: "Recusada", canceled: "Cancelada", expired: "Expirada" };
    const PAYMENT_STATUS = { approved: "Aprovado", rejected: "Recusado", pending: "Pendente", canceled: "Cancelado" };
    const METHOD_LABEL = { pix: "Pix", credit_card: "Cartão de crédito" };
    const RESULT_TITLE = {
        approved: "Pagamento aprovado",
        rejected: "Pagamento recusado",
        pending: "Pagamento em análise",
        canceled: "Pagamento cancelado",
    };
    const RESULT_NOTE = {
        approved: "Sua assinatura está ativa. Lembrete: suas aulas continuam liberadas com ou sem assinatura.",
        rejected: "Nenhuma assinatura foi ativada. Você pode tentar de novo quando quiser.",
        pending: "A assinatura será ativada assim que o pagamento for confirmado.",
        canceled: "Nenhuma assinatura foi ativada.",
    };
    // Números especiais que produzem resultados diferentes de "aprovado" (útil para demonstrar
    // recusa e análise). O resultado é decidido aqui, no navegador: os dados do cartão nunca saem da página.
    const TEST_CARDS = [
        { number: "4242424242424242", result: "approved", reason: "" },
        { number: "4000000000000002", result: "rejected", reason: "O emissor do cartão recusou a transação." },
        { number: "4000000000009995", result: "rejected", reason: "Saldo insuficiente no cartão." },
        { number: "4000000000000259", result: "pending", reason: "O pagamento ficou em análise antifraude." },
    ];
    const PIX_MINUTES = 10;
    const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    let plans = [];
    let subscriptions = [];
    let payments = [];
    let selectedPlan = null;
    let step = "method";
    let processing = false;
    let pixTimer = 0;
    let pixDeadline = 0;
    let lastFocused = null;
    let cancelTarget = null;
    let canceling = false;
    let cancelFocus = null;
    // ---------- Utilitários ----------
    let toastTimer = 0;
    function toast(message, kind = "info") {
        const element = $("toast");
        element.textContent = message;
        element.className = `toast toast--${kind}`;
        element.hidden = false;
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => { element.hidden = true; }, 4200);
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
    function pill(status, labels) {
        const tone = status === "active" || status === "approved" ? "ok"
            : status === "pending" ? "warn"
                : status === "failed" || status === "rejected" ? "bad" : "neutral";
        return `<span class="status-pill status-pill--${tone}">${esc(labels[status] || status)}</span>`;
    }
    function hasActiveSubscription(planId) {
        return subscriptions.some((item) => item.plan_id === planId && item.status === "active");
    }
    // ---------- Cabeçalho ----------
    function renderUser(name, email, role) {
        $("userName").textContent = name.split(/\s+/)[0] || name;
        $("userAvatar").textContent = AppSession.initial(name);
        $("menuName").textContent = name;
        $("menuEmail").textContent = email;
        const staff = role === "admin" || role === "teacher";
        $("navAdmin").toggleAttribute("hidden", !staff);
        $("menuAdmin").toggleAttribute("hidden", !staff);
    }
    // ---------- Planos ----------
    function renderPlans() {
        const grid = $("planGrid");
        if (!plans.length) {
            grid.innerHTML = '<p class="history-empty">Nenhum plano disponível no momento. Volte em breve!</p>';
            return;
        }
        grid.innerHTML = plans.map((plan) => {
            const free = plan.price === 0;
            const price = free
                ? '<b>Grátis</b>'
                : `<b>${esc(money.format(plan.price))}</b><span>/${esc(PERIOD_UNIT[plan.billing_period] || "período")}</span>`;
            const features = plan.features.length
                ? `<ul class="plan-features">${plan.features.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
                : "";
            const active = hasActiveSubscription(plan.id);
            return `<article class="plan-card${plan.is_featured ? " plan-card--featured" : ""}">`
                + (plan.is_featured ? '<span class="plan-ribbon">Destaque</span>' : "")
                + `<h3>${esc(plan.name)}</h3>`
                + (plan.description ? `<p class="plan-description">${esc(plan.description)}</p>` : "")
                + `<p class="plan-price">${price}</p>`
                + `<p class="plan-validity">Vigência de ${plan.duration_days} ${plan.duration_days === 1 ? "dia" : "dias"}</p>`
                + features
                + (active ? '<span class="plan-current">Você já tem este plano ativo</span>' : "")
                + `<button class="btn-primary" type="button" data-plan="${esc(plan.id)}">${active ? "Renovar" : "Contratar"}</button>`
                + `</article>`;
        }).join("");
    }
    // ---------- Assinaturas e pagamentos ----------
    function renderSubscriptions() {
        const list = $("subscriptionList");
        if (!subscriptions.length) {
            list.innerHTML = '<p class="history-empty">Você ainda não contratou nenhum plano.</p>';
            return;
        }
        list.innerHTML = subscriptions.map((item) => {
            const validity = item.start_date && item.end_date
                ? `${formatDate(item.start_date)} até ${formatDate(item.end_date)}`
                : "Sem vigência";
            return `<article class="history-row">`
                + `<div><h3>${esc(item.plan_name_snapshot)}</h3>`
                + `<p>${esc(PERIOD_LABEL[item.billing_period_snapshot] || item.billing_period_snapshot)} · ${esc(validity)}</p></div>`
                + `<div class="history-side"><b>${esc(money.format(Number(item.amount_snapshot)))}</b>${pill(item.status, SUBSCRIPTION_STATUS)}`
                + (item.status === "active" || item.status === "pending"
                    ? `<button class="row-action" type="button" data-cancel-sub="${esc(item.id)}">Cancelar assinatura</button>`
                    : "")
                + `</div></article>`;
        }).join("");
    }
    function renderPayments() {
        const list = $("paymentList");
        if (!payments.length) {
            list.innerHTML = '<p class="history-empty">Nenhum pagamento ainda.</p>';
            return;
        }
        list.innerHTML = payments.map((item) => `<article class="history-row">`
            + `<div><h3>${esc(item.plan_name)}</h3>`
            + `<p>${esc(METHOD_LABEL[item.payment_method] || item.payment_method)} · ${esc(formatDateTime(item.created_at))}</p></div>`
            + `<div class="history-side"><b>${esc(money.format(Number(item.amount)))}</b>${pill(item.status, PAYMENT_STATUS)}</div>`
            + `</article>`).join("");
    }
    async function loadPlans() {
        try {
            const data = await AppSession.api("/plans");
            plans = (data.plans || []).map((plan) => (Object.assign(Object.assign({}, plan), { features: Array.isArray(plan.features) ? plan.features : [] })));
            renderPlans();
        }
        catch (error) {
            $("planGrid").innerHTML = `<p class="history-empty">${esc(errorMessage(error, "Não foi possível carregar os planos."))}</p>`;
        }
    }
    async function loadAccount() {
        await Promise.all([
            (async () => {
                try {
                    subscriptions = (await AppSession.api("/my/subscriptions")).subscriptions || [];
                    renderSubscriptions();
                }
                catch (error) {
                    $("subscriptionList").innerHTML = `<p class="history-empty">${esc(errorMessage(error, "Não foi possível carregar suas assinaturas."))}</p>`;
                }
            })(),
            (async () => {
                try {
                    payments = (await AppSession.api("/my/payments")).payments || [];
                    renderPayments();
                }
                catch (error) {
                    $("paymentList").innerHTML = `<p class="history-empty">${esc(errorMessage(error, "Não foi possível carregar seus pagamentos."))}</p>`;
                }
            })(),
        ]);
        if (plans.length)
            renderPlans();
    }
    // ---------- Cartão: validação (tudo local) ----------
    const cardNumber = $("cardNumber");
    const cardName = $("cardName");
    const cardExpiry = $("cardExpiry");
    const cardCvv = $("cardCvv");
    const cardFields = [cardNumber, cardName, cardExpiry, cardCvv];
    function luhn(digits) {
        let sum = 0;
        let double = false;
        for (let i = digits.length - 1; i >= 0; i--) {
            let value = digits.charCodeAt(i) - 48;
            if (double) {
                value *= 2;
                if (value > 9)
                    value -= 9;
            }
            sum += value;
            double = !double;
        }
        return sum % 10 === 0;
    }
    function cardBrand(digits) {
        if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(digits))
            return "Elo";
        if (/^4/.test(digits))
            return "Visa";
        if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits))
            return "Mastercard";
        if (/^3[47]/.test(digits))
            return "Amex";
        return "Cartão";
    }
    function digitsOf(input) {
        return input.value.replace(/\D/g, "");
    }
    function setFieldError(input, message) {
        $(`${input.id}Error`).textContent = message;
        input.setAttribute("aria-invalid", message ? "true" : "false");
    }
    function validateCard() {
        let firstInvalid = null;
        const fail = (input, message) => {
            setFieldError(input, message);
            if (!firstInvalid)
                firstInvalid = input;
        };
        cardFields.forEach((input) => setFieldError(input, ""));
        const number = digitsOf(cardNumber);
        if (number.length < 13 || number.length > 19 || !luhn(number))
            fail(cardNumber, "Número de cartão inválido.");
        if (cardName.value.trim().length < 3 || !/[A-Za-zÀ-ÿ]/.test(cardName.value))
            fail(cardName, "Informe o nome como está no cartão.");
        const expiry = /^(\d{2})\/(\d{2})$/.exec(cardExpiry.value.trim());
        if (!expiry) {
            fail(cardExpiry, "Use o formato MM/AA.");
        }
        else {
            const month = Number(expiry[1]);
            const year = 2000 + Number(expiry[2]);
            const now = new Date();
            if (month < 1 || month > 12)
                fail(cardExpiry, "Mês inválido.");
            else if (new Date(year, month, 1) <= now)
                fail(cardExpiry, "Cartão vencido.");
            else if (year > now.getFullYear() + 20)
                fail(cardExpiry, "Validade inválida.");
        }
        const cvv = digitsOf(cardCvv);
        if (cvv.length < 3 || cvv.length > 4)
            fail(cardCvv, "Informe o código de 3 ou 4 dígitos.");
        firstInvalid === null || firstInvalid === void 0 ? void 0 : firstInvalid.focus();
        return !firstInvalid;
    }
    cardNumber.addEventListener("input", () => {
        const digits = digitsOf(cardNumber).slice(0, 19);
        cardNumber.value = digits.replace(/(.{4})/g, "$1 ").trim();
        $("cardBrand").textContent = digits ? cardBrand(digits) : "";
    });
    cardExpiry.addEventListener("input", () => {
        const digits = digitsOf(cardExpiry).slice(0, 4);
        cardExpiry.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    });
    cardCvv.addEventListener("input", () => { cardCvv.value = digitsOf(cardCvv).slice(0, 4); });
    cardFields.forEach((input) => input.addEventListener("input", () => setFieldError(input, "")));
    function clearCardFields() {
        cardFields.forEach((input) => { input.value = ""; setFieldError(input, ""); });
        $("cardBrand").textContent = "";
    }
    // ---------- Pix (tudo ilustrativo) ----------
    function randomCode(length) {
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const bytes = new Uint8Array(length);
        window.crypto.getRandomValues(bytes);
        return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
    }
    /** QR Code ilustrativo: três marcadores nos cantos e o resto aleatório. Não lê em app nenhum. */
    function fakeQr(seed) {
        const size = 29;
        let state = 1779033703 ^ seed.length;
        for (let i = 0; i < seed.length; i++) {
            state = Math.imul(state ^ seed.charCodeAt(i), 3432918353);
            state = (state << 13) | (state >>> 19);
        }
        const next = () => {
            state = Math.imul(state ^ (state >>> 16), 2246822507);
            state = Math.imul(state ^ (state >>> 13), 3266489909);
            state ^= state >>> 16;
            return (state >>> 0) / 4294967296;
        };
        const finders = [[0, 0], [size - 7, 0], [0, size - 7]];
        const dark = (x, y) => {
            for (const [ox, oy] of finders) {
                const dx = x - ox;
                const dy = y - oy;
                if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) {
                    if (dx < 0 || dx > 6 || dy < 0 || dy > 6)
                        return false;
                    return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
                }
            }
            return next() < 0.5;
        };
        let path = "";
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++)
                if (dark(x, y))
                    path += `M${x} ${y}h1v1h-1z`;
        }
        return `<svg viewBox="-2 -2 ${size + 4} ${size + 4}" role="img" aria-label="QR Code do Pix">`
            + `<rect x="-2" y="-2" width="${size + 4}" height="${size + 4}" fill="#fff"/><path d="${path}" fill="#1c1530"/></svg>`;
    }
    function stopPixTimer() {
        window.clearInterval(pixTimer);
        pixTimer = 0;
    }
    function tickPix() {
        const left = Math.max(0, pixDeadline - Date.now());
        const minutes = String(Math.floor(left / 60000)).padStart(2, "0");
        const seconds = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
        $("pixTimer").textContent = left > 0 ? `Expira em ${minutes}:${seconds}` : "Código expirado";
        if (left > 0)
            return;
        stopPixTimer();
        $("pixExpired").hidden = false;
        $("pixPay").hidden = true;
        $("pixCancel").hidden = true;
        $("pixRenew").hidden = false;
    }
    function startPix() {
        if (!selectedPlan)
            return;
        const code = `INSTRUMENTALIST-${randomCode(32)}`;
        $("pixCode").value = code;
        $("pixQr").innerHTML = fakeQr(code);
        $("pixAmount").textContent = money.format(selectedPlan.price);
        $("pixExpired").hidden = true;
        $("pixError").textContent = "";
        $("pixPay").hidden = false;
        $("pixCancel").hidden = false;
        $("pixRenew").hidden = true;
        $("pixCopy").textContent = "Copiar";
        pixDeadline = Date.now() + PIX_MINUTES * 60 * 1000;
        stopPixTimer();
        tickPix();
        pixTimer = window.setInterval(tickPix, 1000);
    }
    $("pixCopy").addEventListener("click", async () => {
        const input = $("pixCode");
        try {
            await navigator.clipboard.writeText(input.value);
            $("pixCopy").textContent = "Copiado!";
        }
        catch (_a) {
            input.select();
            toast("Não consegui copiar sozinho. Selecionei o código para você copiar.", "info");
        }
    });
    // ---------- Etapas do pagamento ----------
    function showStep(next) {
        step = next;
        const sections = {
            method: $("stepMethod"), free: $("stepFree"), card: $("cardForm"),
            pix: $("stepPix"), processing: $("stepProcessing"), result: $("checkoutResult"),
        };
        Object.keys(sections).forEach((key) => { sections[key].hidden = key !== next; });
        const level = next === "method" || next === "free" ? 1 : next === "card" || next === "pix" ? 2 : 3;
        $("checkoutStepper").querySelectorAll("li").forEach((item, index) => {
            item.classList.toggle("is-current", index + 1 === level);
            item.classList.toggle("is-done", index + 1 < level || (next === "result" && index + 1 === level));
        });
        $("checkoutStepper").hidden = next === "free";
        if (next !== "pix")
            stopPixTimer();
    }
    function openCheckout(plan) {
        var _a;
        selectedPlan = plan;
        processing = false;
        lastFocused = lastFocused || document.activeElement;
        $("checkoutTitle").textContent = plan.name;
        $("checkoutSummary").textContent = plan.price === 0
            ? `Plano gratuito · vigência de ${plan.duration_days} dias`
            : `${money.format(plan.price)} / ${PERIOD_UNIT[plan.billing_period] || "período"} · vigência de ${plan.duration_days} dias`;
        clearCardFields();
        ["cardError", "pixError", "freeError"].forEach((id) => { $(id).textContent = ""; });
        const pix = document.querySelector('input[name="method"][value="pix"]');
        if (pix)
            pix.checked = true;
        $("cardSubmit").textContent = `Pagar ${money.format(plan.price)}`;
        $("checkoutOverlay").hidden = false;
        document.body.classList.add("no-scroll");
        if (plan.price === 0) {
            showStep("free");
            $("freeConfirm").focus();
        }
        else {
            showStep("method");
            (_a = document.querySelector('input[name="method"]:checked')) === null || _a === void 0 ? void 0 : _a.focus();
        }
    }
    function closeCheckout() {
        const overlay = $("checkoutOverlay");
        if (overlay.hidden || processing)
            return;
        overlay.hidden = true;
        stopPixTimer();
        clearCardFields();
        selectedPlan = null;
        document.body.classList.remove("no-scroll");
        if (lastFocused instanceof HTMLElement)
            lastFocused.focus();
        lastFocused = null;
    }
    function renderProcessing(labels, current) {
        $("processingList").innerHTML = labels.map((label, index) => {
            const state = index < current ? "is-done" : index === current ? "is-active" : "";
            return `<li class="${state}">${esc(label)}</li>`;
        }).join("");
    }
    function showResult(purchase, reason, method, cardLabel) {
        const status = purchase.payment_status;
        $("resultTitle").textContent = RESULT_TITLE[status] || "Pagamento concluído";
        $("resultIcon").className = `result-icon result-icon--${status === "approved" ? "ok" : status === "pending" ? "warn" : "bad"}`;
        $("resultIcon").textContent = status === "approved" ? "✓" : status === "pending" ? "…" : "×";
        const rows = [
            ["Plano", purchase.plan_name],
            ["Valor", money.format(Number(purchase.amount))],
            ["Forma de pagamento", method === "credit_card" && cardLabel ? cardLabel : METHOD_LABEL[method]],
            ["Situação da assinatura", SUBSCRIPTION_STATUS[purchase.subscription_status] || purchase.subscription_status],
        ];
        if (purchase.start_date && purchase.end_date)
            rows.push(["Vigência", `${formatDate(purchase.start_date)} até ${formatDate(purchase.end_date)}`]);
        $("resultList").innerHTML = rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("");
        $("resultReason").textContent = reason;
        $("resultReason").hidden = !reason;
        $("resultNote").textContent = RESULT_NOTE[status] || "";
        $("resultRetry").hidden = status === "approved";
        showStep("result");
        $("resultDone").focus();
    }
    /** Mostra as etapas de processamento e só então registra o resultado.
     *  Para a API seguem apenas plano, forma de pagamento e resultado. */
    async function runPayment(method, result, reason, backTo, cardLabel = "") {
        const plan = selectedPlan;
        if (!plan || processing)
            return;
        processing = true;
        const labels = method === "pix"
            ? ["Verificando o código Pix", "Aguardando confirmação do banco", "Registrando o pagamento"]
            : ["Validando os dados do cartão", "Consultando o banco emissor", "Registrando o pagamento"];
        showStep("processing");
        renderProcessing(labels, 0);
        const request = AppSession.api("/plans/purchase", {
            method: "POST",
            json: { plan_id: plan.id, payment_method: method, result },
        }).then((data) => ({ ok: true, purchase: data.purchase }), (error) => ({ ok: false, message: errorMessage(error, "Não foi possível concluir o pagamento.") }));
        for (let index = 0; index < labels.length; index++) {
            renderProcessing(labels, index);
            await sleep(750);
        }
        renderProcessing(labels, labels.length);
        const settled = await request;
        processing = false;
        if (!settled.ok) {
            showStep(backTo);
            const target = backTo === "card" ? "cardError" : backTo === "pix" ? "pixError" : "freeError";
            $(target).textContent = settled.message;
            return;
        }
        clearCardFields();
        showResult(settled.purchase, reason, method, cardLabel);
        await loadAccount();
    }
    // ---------- Ações do diálogo ----------
    $("methodContinue").addEventListener("click", () => {
        var _a;
        const method = (_a = document.querySelector('input[name="method"]:checked')) === null || _a === void 0 ? void 0 : _a.value;
        if (method === "credit_card") {
            showStep("card");
            cardNumber.focus();
        }
        else {
            startPix();
            showStep("pix");
            $("pixPay").focus();
        }
    });
    $("cardBack").addEventListener("click", () => showStep("method"));
    $("pixBack").addEventListener("click", () => showStep("method"));
    $("cardForm").addEventListener("submit", (event) => {
        event.preventDefault();
        $("cardError").textContent = "";
        if (processing || !validateCard())
            return;
        const digits = digitsOf(cardNumber);
        const known = TEST_CARDS.find((card) => card.number === digits);
        const label = `${cardBrand(digits)} •••• ${digits.slice(-4)}`;
        runPayment("credit_card", known ? known.result : "approved", known ? known.reason : "", "card", label);
    });
    $("pixPay").addEventListener("click", () => { runPayment("pix", "approved", "", "pix"); });
    $("pixCancel").addEventListener("click", () => { runPayment("pix", "canceled", "Você cancelou o pagamento do Pix.", "pix"); });
    $("pixRenew").addEventListener("click", () => { startPix(); $("pixPay").focus(); });
    $("freeConfirm").addEventListener("click", () => { runPayment("pix", "approved", "", "free"); });
    $("resultRetry").addEventListener("click", () => {
        if (selectedPlan)
            openCheckout(selectedPlan);
    });
    $("planGrid").addEventListener("click", (event) => {
        const button = event.target.closest("[data-plan]");
        if (!button)
            return;
        const plan = plans.find((item) => item.id === button.dataset.plan);
        if (plan)
            openCheckout(plan);
    });
    $("checkoutOverlay").addEventListener("click", (event) => {
        const target = event.target;
        if (target === $("checkoutOverlay") || target.closest("[data-close]"))
            closeCheckout();
    });
    // ---------- Cancelar assinatura ----------
    function openCancel(subscription) {
        cancelTarget = subscription;
        cancelFocus = document.activeElement;
        const pending = subscription.status === "pending";
        $("cancelSummary").textContent = `${subscription.plan_name_snapshot} · ${money.format(Number(subscription.amount_snapshot))}`;
        $("cancelText").textContent = pending
            ? "O pagamento pendente também será cancelado."
            : "A assinatura será encerrada agora e a vigência termina hoje. Não há reembolso do pagamento já feito. Suas aulas continuam liberadas.";
        $("cancelError").textContent = "";
        $("cancelOverlay").hidden = false;
        document.body.classList.add("no-scroll");
        $("cancelKeep").focus();
    }
    function closeCancel() {
        if ($("cancelOverlay").hidden || canceling)
            return;
        $("cancelOverlay").hidden = true;
        cancelTarget = null;
        if ($("checkoutOverlay").hidden)
            document.body.classList.remove("no-scroll");
        if (cancelFocus instanceof HTMLElement)
            cancelFocus.focus();
        cancelFocus = null;
    }
    $("subscriptionList").addEventListener("click", (event) => {
        const button = event.target.closest("[data-cancel-sub]");
        if (!button)
            return;
        const subscription = subscriptions.find((item) => item.id === button.dataset.cancelSub);
        if (subscription)
            openCancel(subscription);
    });
    $("cancelConfirm").addEventListener("click", async () => {
        const target = cancelTarget;
        if (!target || canceling)
            return;
        const button = $("cancelConfirm");
        canceling = true;
        button.disabled = true;
        $("cancelError").textContent = "";
        try {
            await AppSession.api("/my/subscriptions/cancel", { method: "POST", json: { subscription_id: target.id } });
            canceling = false;
            closeCancel();
            toast("Assinatura cancelada.", "success");
            await loadAccount();
        }
        catch (error) {
            $("cancelError").textContent = errorMessage(error, "Não foi possível cancelar a assinatura.");
        }
        finally {
            canceling = false;
            button.disabled = false;
        }
    });
    $("cancelKeep").addEventListener("click", closeCancel);
    $("cancelClose").addEventListener("click", closeCancel);
    $("cancelOverlay").addEventListener("click", (event) => {
        if (event.target === $("cancelOverlay"))
            closeCancel();
    });
    // ---------- Menu e navegação ----------
    const userChip = $("userChip");
    const userMenu = $("userMenu");
    const closeUserMenu = () => { userMenu.classList.remove("is-open"); userChip.setAttribute("aria-expanded", "false"); };
    userChip.addEventListener("click", (event) => {
        event.stopPropagation();
        userChip.setAttribute("aria-expanded", String(userMenu.classList.toggle("is-open")));
    });
    document.addEventListener("click", (event) => {
        if (!event.target.closest(".user-menu-wrap"))
            closeUserMenu();
    });
    $("navToggle").addEventListener("click", () => {
        $("navToggle").setAttribute("aria-expanded", String($("navLinks").classList.toggle("is-open")));
    });
    $("navLinks").addEventListener("click", (event) => {
        if (event.target.closest("a")) {
            $("navLinks").classList.remove("is-open");
            $("navToggle").setAttribute("aria-expanded", "false");
        }
    });
    $("logoutButton").addEventListener("click", () => { AppSession.logout(); });
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape")
            return;
        closeUserMenu();
        if (!$("cancelOverlay").hidden) {
            closeCancel();
            return;
        }
        closeCheckout();
    });
    // ---------- Início ----------
    async function init() {
        $("footerCopy").textContent = `© ${new Date().getFullYear()} The Instrumentalist`;
        renderUser(stored.name || "", stored.email || "", stored.role || "student");
        // O papel salvo no navegador pode estar desatualizado: confirma no servidor.
        AppSession.api("/me")
            .then((data) => {
            const me = Object.assign(Object.assign({}, stored), data.user);
            AppSession.saveUser(me);
            renderUser(me.name || "", me.email || "", me.role || "student");
        })
            .catch(() => undefined);
        await loadPlans();
        await loadAccount();
    }
    init();
})();
