(() => {
  "use strict";

  const API_URL = window.location.protocol === "file:" ? "http://localhost:8001" : window.location.origin;
  const toggleBtn = document.getElementById("togglePassword");
  const passwordInput = document.getElementById("password") as HTMLInputElement | null;
  const loginForm = document.getElementById("loginForm") as HTMLFormElement | null;
  const emailInput = document.getElementById("email") as HTMLInputElement | null;
  const emailError = document.getElementById("emailError");
  const passwordError = document.getElementById("passwordError");

  function isValidEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
  function showError(element: HTMLElement | null, message: string): void { if (element) element.textContent = message; }

  toggleBtn?.addEventListener("click", () => {
    if (!passwordInput) return;
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    toggleBtn.setAttribute("aria-pressed", String(isPassword));
    toggleBtn.setAttribute("aria-label", isPassword ? "Ocultar senha" : "Mostrar senha");
  });

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!emailInput || !passwordInput) return;
    showError(emailError, ""); showError(passwordError, "");
    const email = emailInput.value.trim();
    let valid = true;
    if (!email) { showError(emailError, "Informe seu e-mail."); valid = false; }
    else if (!isValidEmail(email)) { showError(emailError, "Digite um e-mail válido."); valid = false; }
    if (!passwordInput.value) { showError(passwordError, "Informe sua senha."); valid = false; }
    else if (passwordInput.value.length < 6) { showError(passwordError, "A senha deve ter pelo menos 6 caracteres."); valid = false; }
    if (!valid) return;

    try {
      const response = await fetch(`${API_URL}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: passwordInput.value, remember: (document.getElementById("remember") as HTMLInputElement | null)?.checked || false }) });
      const data = await response.json() as { success?: boolean; message?: string; user?: { email: string; name: string } };
      if (response.ok && data.success) {
        if (data.user) localStorage.setItem("theInstrumentalistUser", JSON.stringify(data.user));
        window.location.href = "home.html";
      } else if (data.message) {
        showError(data.message.toLowerCase().includes("e-mail") ? emailError : passwordError, data.message);
      }
    } catch (error) { showError(passwordError, "Não foi possível conectar ao servidor de login."); console.error(error); }
  });

  const overlay = document.getElementById("modalOverlay");
  const recoveryForm = document.getElementById("recoveryForm") as HTMLFormElement | null;
  const recoveryEmail = document.getElementById("recoveryEmail") as HTMLInputElement | null;
  const recoveryError = document.getElementById("recoveryError");
  const modalFeedback = document.getElementById("modalFeedback");
  let lastFocused: Element | null = null;

  function openModal(mode: "login" | "password"): void {
    lastFocused = document.activeElement;
    document.getElementById("modalTitle")!.textContent = mode === "login" ? "Recuperar meu login" : "Recuperar acesso";
    document.getElementById("modalSub")!.textContent = mode === "login" ? "Informe um e-mail alternativo ou telefone e enviaremos o nome de usuário associado à sua conta." : "Informe o e-mail associado à sua conta e enviaremos um link para redefinir sua senha.";
    if (recoveryForm) recoveryForm.style.display = "";
    modalFeedback?.classList.remove("show"); showError(recoveryError, "");
    if (recoveryEmail) { recoveryEmail.value = ""; recoveryEmail.focus(); }
    overlay?.classList.add("open");
  }
  function closeModal(): void { overlay?.classList.remove("open"); if (lastFocused instanceof HTMLElement) lastFocused.focus(); }

  document.getElementById("forgotPasswordBtn")?.addEventListener("click", () => openModal("password"));
  document.getElementById("forgotLoginBtn")?.addEventListener("click", () => openModal("login"));
  document.getElementById("signupBtn")?.addEventListener("click", () => alert("Ligue este botão à sua página de cadastro."));
  document.getElementById("modalClose")?.addEventListener("click", closeModal);
  overlay?.addEventListener("click", (event) => { if (event.target === overlay) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && overlay?.classList.contains("open")) closeModal(); });

  recoveryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!recoveryEmail) return;
    showError(recoveryError, "");
    if (!isValidEmail(recoveryEmail.value.trim())) { showError(recoveryError, "Digite um e-mail válido."); return; }
    try {
      const response = await fetch(`${API_URL}/recover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: recoveryEmail.value.trim() }) });
      const data = await response.json() as { success?: boolean; message?: string };
      if (response.ok && data.success) { recoveryForm.style.display = "none"; modalFeedback?.classList.add("show"); }
      else showError(recoveryError, data.message || "Não foi possível recuperar o acesso.");
    } catch (error) { showError(recoveryError, "Não foi possível conectar ao servidor."); console.error(error); }
  });
})();
