"use strict";
(() => {
    "use strict";
    const form = document.getElementById("resetForm");
    const passwordInput = document.getElementById("password");
    const confirmInput = document.getElementById("confirmPassword");
    const submitButton = document.getElementById("resetSubmit");
    const notice = document.getElementById("pageNotice");
    function error(id, message) {
        const element = document.getElementById(id);
        if (element)
            element.textContent = message;
    }
    function showNotice(message, kind) {
        if (!notice)
            return;
        notice.textContent = message;
        notice.className = `notice notice--${kind}`;
        notice.hidden = false;
    }
    // O link do e-mail traz o token de recuperação no fragmento da URL. Ele é
    // lido uma vez e removido da barra de endereço (não fica no histórico).
    const params = new URLSearchParams(window.location.hash.slice(1));
    const recoveryToken = params.get("type") === "recovery" ? params.get("access_token") : null;
    if (window.location.hash)
        history.replaceState(null, "", window.location.pathname);
    if (!recoveryToken) {
        form === null || form === void 0 ? void 0 : form.setAttribute("hidden", "");
        showNotice(params.get("error_code") === "otp_expired"
            ? "Este link expirou ou já foi usado. Volte ao login e peça um novo em “Esqueci minha senha”."
            : "Link inválido. Volte ao login e use “Esqueci minha senha” para receber um novo link.", "error");
        return;
    }
    form === null || form === void 0 ? void 0 : form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!passwordInput || !confirmInput || !submitButton)
            return;
        error("passwordError", "");
        error("confirmPasswordError", "");
        if (passwordInput.value.length < 6) {
            error("passwordError", "A senha deve ter pelo menos 6 caracteres.");
            return;
        }
        if (passwordInput.value !== confirmInput.value) {
            error("confirmPasswordError", "As senhas não coincidem.");
            return;
        }
        submitButton.disabled = true;
        submitButton.textContent = "Salvando…";
        try {
            await AppSession.api("/password", {
                method: "POST",
                auth: false,
                headers: { Authorization: `Bearer ${recoveryToken}` },
                json: { password: passwordInput.value },
            });
            AppSession.clear();
            window.location.replace("login.html?reset=1");
        }
        catch (requestError) {
            error("passwordError", requestError instanceof Error ? requestError.message : "Não foi possível salvar a senha.");
            submitButton.disabled = false;
            submitButton.textContent = "Salvar nova senha";
        }
    });
})();
