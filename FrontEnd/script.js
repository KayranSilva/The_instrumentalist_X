"use strict";
(() => {
    "use strict";
    var _a, _b, _c, _d;
    const API_URL = window.location.protocol === "file:" ? "http://localhost:8001" : window.location.origin;
    const toggleBtn = document.getElementById("togglePassword");
    const passwordInput = document.getElementById("password");
    const loginForm = document.getElementById("loginForm");
    const emailInput = document.getElementById("email");
    const emailError = document.getElementById("emailError");
    const passwordError = document.getElementById("passwordError");
    function isValidEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
    function showError(element, message) { if (element)
        element.textContent = message; }
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
        if (!emailInput || !passwordInput)
            return;
        showError(emailError, "");
        showError(passwordError, "");
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
        else if (passwordInput.value.length < 6) {
            showError(passwordError, "A senha deve ter pelo menos 6 caracteres.");
            valid = false;
        }
        if (!valid)
            return;
        try {
            const response = await fetch(`${API_URL}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: passwordInput.value, remember: ((_a = document.getElementById("remember")) === null || _a === void 0 ? void 0 : _a.checked) || false }) });
            const data = await response.json();
            if (response.ok && data.success) {
                if (data.user)
                    localStorage.setItem("theInstrumentalistUser", JSON.stringify(data.user));
                window.location.href = "home.html";
            }
            else if (data.message) {
                showError(data.message.toLowerCase().includes("e-mail") ? emailError : passwordError, data.message);
            }
        }
        catch (error) {
            showError(passwordError, "Não foi possível conectar ao servidor de login.");
            console.error(error);
        }
    });
    const overlay = document.getElementById("modalOverlay");
    const recoveryForm = document.getElementById("recoveryForm");
    const recoveryEmail = document.getElementById("recoveryEmail");
    const recoveryError = document.getElementById("recoveryError");
    const modalFeedback = document.getElementById("modalFeedback");
    let lastFocused = null;
    function openModal(mode) {
        lastFocused = document.activeElement;
        document.getElementById("modalTitle").textContent = mode === "login" ? "Recuperar meu login" : "Recuperar acesso";
        document.getElementById("modalSub").textContent = mode === "login" ? "Informe um e-mail alternativo ou telefone e enviaremos o nome de usuário associado à sua conta." : "Informe o e-mail associado à sua conta e enviaremos um link para redefinir sua senha.";
        if (recoveryForm)
            recoveryForm.style.display = "";
        modalFeedback === null || modalFeedback === void 0 ? void 0 : modalFeedback.classList.remove("show");
        showError(recoveryError, "");
        if (recoveryEmail) {
            recoveryEmail.value = "";
            recoveryEmail.focus();
        }
        overlay === null || overlay === void 0 ? void 0 : overlay.classList.add("open");
    }
    function closeModal() { overlay === null || overlay === void 0 ? void 0 : overlay.classList.remove("open"); if (lastFocused instanceof HTMLElement)
        lastFocused.focus(); }
    (_a = document.getElementById("forgotPasswordBtn")) === null || _a === void 0 ? void 0 : _a.addEventListener("click", () => openModal("password"));
    (_b = document.getElementById("forgotLoginBtn")) === null || _b === void 0 ? void 0 : _b.addEventListener("click", () => openModal("login"));
    (_c = document.getElementById("signupBtn")) === null || _c === void 0 ? void 0 : _c.addEventListener("click", () => alert("Ligue este botão à sua página de cadastro."));
    (_d = document.getElementById("modalClose")) === null || _d === void 0 ? void 0 : _d.addEventListener("click", closeModal);
    overlay === null || overlay === void 0 ? void 0 : overlay.addEventListener("click", (event) => { if (event.target === overlay)
        closeModal(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && (overlay === null || overlay === void 0 ? void 0 : overlay.classList.contains("open")))
        closeModal(); });
    recoveryForm === null || recoveryForm === void 0 ? void 0 : recoveryForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!recoveryEmail)
            return;
        showError(recoveryError, "");
        if (!isValidEmail(recoveryEmail.value.trim())) {
            showError(recoveryError, "Digite um e-mail válido.");
            return;
        }
        try {
            const response = await fetch(`${API_URL}/recover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: recoveryEmail.value.trim() }) });
            const data = await response.json();
            if (response.ok && data.success) {
                recoveryForm.style.display = "none";
                modalFeedback === null || modalFeedback === void 0 ? void 0 : modalFeedback.classList.add("show");
            }
            else
                showError(recoveryError, data.message || "Não foi possível recuperar o acesso.");
        }
        catch (error) {
            showError(recoveryError, "Não foi possível conectar ao servidor.");
            console.error(error);
        }
    });
})();
