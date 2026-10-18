(() => {
  "use strict";

  const form = document.getElementById("registerForm") as HTMLFormElement | null;
  const nameInput = document.getElementById("name") as HTMLInputElement | null;
  const emailInput = document.getElementById("email") as HTMLInputElement | null;
  const passwordInput = document.getElementById("password") as HTMLInputElement | null;
  const confirmInput = document.getElementById("confirmPassword") as HTMLInputElement | null;
  const optionsContainer = document.getElementById("instrumentOptions");
  const submitButton = document.getElementById("registerSubmit") as HTMLButtonElement | null;

  const FIELD_ERRORS: Record<string, string> = {
    name: "nameError", email: "emailError", password: "passwordError", instrument: "instrumentError",
  };

  function error(id: string, message: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = message;
  }

  function validEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

  function selectedInstrument(): string {
    return document.querySelector<HTMLInputElement>('input[name="instrument"]:checked')?.value || "";
  }

  async function renderInstruments(): Promise<void> {
    if (!optionsContainer) return;
    const instruments = (await AppSession.loadInstruments())
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    optionsContainer.replaceChildren(...instruments.map((item) => {
      const label = document.createElement("label");
      label.className = "instrument-option";
      label.innerHTML = `<input type="radio" name="instrument" value="${AppSession.escapeHtml(item.slug)}" required>`
        + `<span class="instrument-option-icon">${AppSession.instrumentIcon(item.slug, 22)}</span>`
        + `<span class="instrument-option-name">${AppSession.escapeHtml(item.name)}</span>`;
      return label;
    }));
    optionsContainer.addEventListener("change", () => error("instrumentError", ""));
  }

  function showConfirmation(email: string): void {
    document.getElementById("registerArea")?.setAttribute("hidden", "");
    const panel = document.getElementById("confirmPanel");
    const target = document.getElementById("confirmEmail");
    if (target) target.textContent = email;
    panel?.removeAttribute("hidden");
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!nameInput || !emailInput || !passwordInput || !confirmInput || !submitButton) return;
    ["nameError", "emailError", "passwordError", "confirmPasswordError", "instrumentError"].forEach((id) => error(id, ""));

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const instrumentSlug = selectedInstrument();
    let valid = true;
    if (name.length < 2) { error("nameError", "Informe seu nome."); valid = false; }
    if (!validEmail(email)) { error("emailError", "Digite um e-mail válido."); valid = false; }
    if (passwordInput.value.length < 6) { error("passwordError", "A senha deve ter pelo menos 6 caracteres."); valid = false; }
    else if (passwordInput.value !== confirmInput.value) { error("confirmPasswordError", "As senhas não coincidem."); valid = false; }
    if (!instrumentSlug) { error("instrumentError", "Escolha um instrumento."); valid = false; }
    if (!valid) return;

    submitButton.disabled = true;
    submitButton.textContent = "Criando conta…";
    try {
      const data = await AppSession.api<{ requires_confirmation?: boolean; user?: StoredUser }>("/register", {
        method: "POST",
        auth: false,
        json: {
          name, email, password: passwordInput.value, instrument_slug: instrumentSlug,
          redirect_to: `${AppSession.API_URL}/login.html`,
        },
      });
      if (data.user && !data.requires_confirmation) {
        AppSession.saveUser(data.user, true);
        window.location.replace("home.html");
        return;
      }
      showConfirmation(email);
    } catch (requestError) {
      const apiError = requestError instanceof AppApiError ? requestError : null;
      error(FIELD_ERRORS[apiError?.field || ""] || "passwordError", apiError?.message || "Não foi possível criar a conta.");
      submitButton.disabled = false;
      submitButton.textContent = "Criar conta";
    }
  });

  if (AppSession.getUser()) {
    window.location.replace("home.html");
    return;
  }
  renderInstruments();
})();
