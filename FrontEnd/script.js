"use strict";
(() => {
    "use strict";
    var _a, _b;
    const toggleBtn = document.getElementById("togglePassword");
    const passwordInput = document.getElementById("password");
    const loginForm = document.getElementById("loginForm");
    const emailInput = document.getElementById("email");
    const rememberInput = document.getElementById("remember");
    const submitButton = document.getElementById("loginSubmit");
    const emailError = document.getElementById("emailError");
    const passwordError = document.getElementById("passwordError");
    const notice = document.getElementById("pageNotice");
    function isValidEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
    function showError(element, message) { if (element)
        element.textContent = message; }
    function showNotice(message, kind = "info") {
        if (!notice)
            return;
        notice.textContent = message;
        notice.className = `notice notice--${kind}`;
        notice.hidden = false;
    }
    function landingPage(user) {
        return AppSession.isStaff(user) ? "admin.html" : "home.html";
    }
    // Links dos e-mails do Supabase voltam para cá com a sessão (ou o erro)
    // no fragmento da URL: #access_token=...&type=signup ou #error=...
    function handleAuthRedirect() {
        if (!window.location.hash)
            return false;
        const params = new URLSearchParams(window.location.hash.slice(1));
        history.replaceState(null, "", window.location.pathname + window.location.search);
        if (params.get("error")) {
            const code = params.get("error_code") || "";
            showNotice(code === "otp_expired"
                ? "Esse link expirou ou já foi usado. Faça login ou peça um novo link."
                : "Não foi possível validar o link. Tente entrar normalmente.", "error");
            return false;
        }
        const accessToken = params.get("access_token");
        if (!accessToken)
            return false;
        if (params.get("type") === "recovery") {
            window.location.replace(`reset.html#${params.toString()}`);
            return true;
        }
        // Confirmação de e-mail: já entra direto, sem pedir a senha de novo.
        AppSession.saveUser({ email: "", access_token: accessToken, refresh_token: params.get("refresh_token") || "" }, true);
        showNotice("E-mail confirmado! Entrando…", "success");
        window.location.replace("home.html");
        return true;
    }
    function init() {
        if (handleAuthRedirect())
            return;
        const query = new URLSearchParams(window.location.search);
        if (query.get("expired")) {
            showNotice("Sua sessão expirou. Entre novamente para continuar.", "info");
            history.replaceState(null, "", window.location.pathname);
            return;
        }
        if (query.get("reset")) {
            showNotice("Senha alterada com sucesso. Entre com a nova senha.", "success");
            history.replaceState(null, "", window.location.pathname);
            return;
        }
        const existing = AppSession.getUser();
        if (existing)
            window.location.replace(landingPage(existing));
    }
    toggleBtn === null || toggleBtn === void 0 ? void 0 : toggleBtn.addEventListener("click", () => {
        if (!passwordInput)
            return;
        const isPassword = passwordInput.type === "password";
        passwordInput.type = isPassword ? "text" : "password";
        toggleBtn.setAttribute("aria-pressed", String(isPassword));
        toggleBtn.setAttribute("aria-label", isPassword ? "Ocultar senha" : "Mostrar senha");
    });
    loginForm === null || loginForm === void 0 ? void 0 : loginForm.addEventListener("submit", async (event) => {
        var _a;
        event.preventDefault();
        if (!emailInput || !passwordInput || !submitButton)
            return;
        showError(emailError, "");
        showError(passwordError, "");
        if (notice)
            notice.hidden = true;
        const email = emailInput.value.trim();
        let valid = true;
        if (!email) {
            showError(emailError, "Informe seu e-mail.");
            valid = false;
        }
        else if (!isValidEmail(email)) {
            showError(emailError, "Digite um e-mail válido.");
            valid = false;
        }
        if (!passwordInput.value) {
            showError(passwordError, "Informe sua senha.");
            valid = false;
        }
        if (!valid)
            return;
        submitButton.disabled = true;
        submitButton.textContent = "Entrando…";
        try {
            const data = await AppSession.api("/login", {
                method: "POST", auth: false, json: { email, password: passwordInput.value },
            });
            AppSession.saveUser(data.user, (_a = rememberInput === null || rememberInput === void 0 ? void 0 : rememberInput.checked) !== null && _a !== void 0 ? _a : true);
            window.location.replace(landingPage(data.user));
        }
        catch (error) {
            const apiError = error instanceof AppApiError ? error : null;
            const message = (apiError === null || apiError === void 0 ? void 0 : apiError.message) || "Não foi possível entrar.";
            showError((apiError === null || apiError === void 0 ? void 0 : apiError.field) === "email" ? emailError : passwordError, message);
            submitButton.disabled = false;
            submitButton.textContent = "Entrar";
        }
    });
    // ---------- Modal "Esqueci minha senha" ----------
    const overlay = document.getElementById("modalOverlay");
    const recoveryForm = document.getElementById("recoveryForm");
    const recoveryEmail = document.getElementById("recoveryEmail");
    const recoverySubmit = document.getElementById("recoverySubmit");
    const recoveryError = document.getElementById("recoveryError");
    const modalFeedback = document.getElementById("modalFeedback");
    let lastFocused = null;
    function openModal() {
        lastFocused = document.activeElement;
        if (recoveryForm)
            recoveryForm.style.display = "";
        modalFeedback === null || modalFeedback === void 0 ? void 0 : modalFeedback.classList.remove("show");
        showError(recoveryError, "");
        overlay === null || overlay === void 0 ? void 0 : overlay.classList.add("open");
        if (recoveryEmail) {
            recoveryEmail.value = (emailInput === null || emailInput === void 0 ? void 0 : emailInput.value.trim()) || "";
            window.setTimeout(() => recoveryEmail.focus(), 50);
        }
    }
    function closeModal() {
        overlay === null || overlay === void 0 ? void 0 : overlay.classList.remove("open");
        if (lastFocused instanceof HTMLElement)
            lastFocused.focus();
    }
    (_a = document.getElementById("forgotPasswordBtn")) === null || _a === void 0 ? void 0 : _a.addEventListener("click", openModal);
    (_b = document.getElementById("modalClose")) === null || _b === void 0 ? void 0 : _b.addEventListener("click", closeModal);
    overlay === null || overlay === void 0 ? void 0 : overlay.addEventListener("click", (event) => { if (event.target === overlay)
        closeModal(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && (overlay === null || overlay === void 0 ? void 0 : overlay.classList.contains("open")))
        closeModal(); });
    recoveryForm === null || recoveryForm === void 0 ? void 0 : recoveryForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!recoveryEmail || !recoverySubmit)
            return;
        showError(recoveryError, "");
        const email = recoveryEmail.value.trim();
        if (!isValidEmail(email)) {
            showError(recoveryError, "Digite um e-mail válido.");
            return;
        }
        recoverySubmit.disabled = true;
        try {
            await AppSession.api("/recover", {
                method: "POST", auth: false,
                json: { email, redirect_to: `${AppSession.API_URL}/reset.html` },
            });
            recoveryForm.style.display = "none";
            modalFeedback === null || modalFeedback === void 0 ? void 0 : modalFeedback.classList.add("show");
        }
        catch (error) {
            showError(recoveryError, error instanceof Error ? error.message : "Não foi possível enviar o link.");
        }
        finally {
            recoverySubmit.disabled = false;
        }
    });
    init();
})();
