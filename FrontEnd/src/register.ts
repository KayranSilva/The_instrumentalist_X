(() => {
  "use strict";

  const API_URL = window.location.protocol === "file:" ? "http://localhost:8001" : window.location.origin;
  const PENDING_INSTRUMENT_KEY = "theInstrumentalistPendingInstrument";

  // Lista de reserva caso a chamada a /instruments falhe (ex.: instabilidade
  // momentânea de rede). O cadastro não deve ficar bloqueado por isso; o
  // servidor sempre valida o slug escolhido contra o banco antes de aceitar.
  const FALLBACK_INSTRUMENTS: Array<{ slug: string; name: string }> = [
    { slug: "ukulele", name: "Ukulele" },
    { slug: "violao", name: "Violão" },
    { slug: "guitarra", name: "Guitarra" },
    { slug: "piano", name: "Piano" },
    { slug: "bateria", name: "Bateria" },
    { slug: "violino", name: "Violino" },
    { slug: "canto", name: "Canto" },
    { slug: "composicao", name: "Composição" },
  ];

  const form = document.getElementById("registerForm") as HTMLFormElement | null;
  const nameInput = document.getElementById("name") as HTMLInputElement | null;
  const emailInput = document.getElementById("email") as HTMLInputElement | null;
  const passwordInput = document.getElementById("password") as HTMLInputElement | null;
  const confirmInput = document.getElementById("confirmPassword") as HTMLInputElement | null;
  const instrumentSelect = document.getElementById("instrument") as HTMLSelectElement | null;
  const status = document.getElementById("formStatus");

  function error(id: string, message: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = message;
  }

  function validEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

  async function loadInstruments(): Promise<void> {
    if (!instrumentSelect) return;
    let instruments = FALLBACK_INSTRUMENTS;
    try {
      const response = await fetch(`${API_URL}/instruments`);
      const data = await response.json() as { success?: boolean; instruments?: Array<{ slug: string; name: string }> };
      if (response.ok && data.success && data.instruments?.length) instruments = data.instruments;
    } catch (requestError) {
      console.error("Não foi possível carregar instrumentos do servidor, usando lista local.", requestError);
    }
    instrumentSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = "Escolha um instrumento ou objetivo";
    instrumentSelect.appendChild(placeholder);
    instruments
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .forEach((item) => {
        const option = document.createElement("option");
        option.value = item.slug;
        option.textContent = item.name;
        instrumentSelect.appendChild(option);
      });
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!nameInput || !emailInput || !passwordInput || !confirmInput || !instrumentSelect) return;
    ["nameError", "emailError", "passwordError", "confirmPasswordError", "instrumentError"].forEach((id) => error(id, ""));
    if (status) status.textContent = "";

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const instrumentSlug = instrumentSelect.value;
    let valid = true;
    if (!name) { error("nameError", "Informe seu nome."); valid = false; }
    if (!validEmail(email)) { error("emailError", "Digite um e-mail válido."); valid = false; }
    if (passwordInput.value.length < 6) { error("passwordError", "A senha deve ter pelo menos 6 caracteres."); valid = false; }
    if (passwordInput.value !== confirmInput.value) { error("confirmPasswordError", "As senhas não coincidem."); valid = false; }
    if (!instrumentSlug) { error("instrumentError", "Escolha um instrumento ou objetivo."); valid = false; }
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

      // O instrumento escolhido só pode ser salvo no perfil quando existir uma
      // sessão autenticada (access_token). Como a confirmação de e-mail está
      // ativa, isso normalmente só acontece no primeiro login — por isso a
      // escolha fica guardada localmente até lá (script.ts lê essa chave).
      try { localStorage.setItem(PENDING_INSTRUMENT_KEY, instrumentSlug); } catch { /* localStorage indisponível, segue sem guardar */ }

      if (data.user) localStorage.setItem("theInstrumentalistUser", JSON.stringify(data.user));
      if (status) status.textContent = data.message || "Conta criada com sucesso.";
      if (data.user) window.setTimeout(() => { window.location.href = "home.html"; }, 700);
      else window.setTimeout(() => { window.location.href = "login.html"; }, 1800);
    } catch (requestError) {
      error("passwordError", "Não foi possível conectar ao servidor.");
      console.error(requestError);
    }
  });

  loadInstruments();
})();
