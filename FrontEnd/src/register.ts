(() => {
  "use strict";

  const API_URL = window.location.protocol === "file:" ? "http://localhost:8001" : window.location.origin;
  const form = document.getElementById("registerForm") as HTMLFormElement | null;
  const nameInput = document.getElementById("name") as HTMLInputElement | null;
  const emailInput = document.getElementById("email") as HTMLInputElement | null;
  const passwordInput = document.getElementById("password") as HTMLInputElement | null;
  const confirmInput = document.getElementById("confirmPassword") as HTMLInputElement | null;
  const status = document.getElementById("formStatus");

  function error(id: string, message: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = message;
  }

  function validEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!nameInput || !emailInput || !passwordInput || !confirmInput) return;
    ["nameError", "emailError", "passwordError", "confirmPasswordError"].forEach((id) => error(id, ""));
    if (status) status.textContent = "";

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    let valid = true;
    if (!name) { error("nameError", "Informe seu nome."); valid = false; }
    if (!validEmail(email)) { error("emailError", "Digite um e-mail válido."); valid = false; }
    if (passwordInput.value.length < 6) { error("passwordError", "A senha deve ter pelo menos 6 caracteres."); valid = false; }
    if (passwordInput.value !== confirmInput.value) { error("confirmPasswordError", "As senhas não coincidem."); valid = false; }
    if (!valid) return;

    try {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password: passwordInput.value }),
      });
      const data = await response.json() as { success?: boolean; message?: string; requires_confirmation?: boolean; user?: { email: string; name: string } };
      if (!response.ok || !data.success) {
        error(data.message?.toLowerCase().includes("e-mail") ? "emailError" : "passwordError", data.message || "Não foi possível criar a conta.");
        return;
      }
      if (data.user) localStorage.setItem("theInstrumentalistUser", JSON.stringify(data.user));
      if (status) status.textContent = data.message || "Conta criada com sucesso.";
      if (data.user) window.setTimeout(() => { window.location.href = "home.html"; }, 700);
      else window.setTimeout(() => { window.location.href = "login.html"; }, 1800);
    } catch (requestError) {
      error("passwordError", "Não foi possível conectar ao servidor.");
      console.error(requestError);
    }
  });
})();
