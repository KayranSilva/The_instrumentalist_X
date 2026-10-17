"use strict";
(() => {
    "use strict";
    const API_URL = window.location.protocol === "file:" ? "http://localhost:8001" : window.location.origin;
    const PENDING_INSTRUMENT_KEY = "theInstrumentalistPendingInstrument";
    // Lista de reserva caso a chamada a /instruments falhe (ex.: instabilidade
    // momentânea de rede). O cadastro não deve ficar bloqueado por isso; o
    // servidor sempre valida o slug escolhido contra o banco antes de aceitar.
    const FALLBACK_INSTRUMENTS = [
        { slug: "ukulele", name: "Ukulele" },
        { slug: "violao", name: "Violão" },
        { slug: "guitarra", name: "Guitarra" },
        { slug: "piano", name: "Piano" },
        { slug: "bateria", name: "Bateria" },
        { slug: "violino", name: "Violino" },
        { slug: "canto", name: "Canto" },
        { slug: "composicao", name: "Composição" },
    ];
    const form = document.getElementById("registerForm");
    const nameInput = document.getElementById("name");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const confirmInput = document.getElementById("confirmPassword");
    const instrumentSelect = document.getElementById("instrument");
    const status = document.getElementById("formStatus");
    function error(id, message) {
        const element = document.getElementById(id);
        if (element)
            element.textContent = message;
    }
    function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
    async function loadInstruments() {
        var _a;
        if (!instrumentSelect)
            return;
        let instruments = FALLBACK_INSTRUMENTS;
        try {
            const response = await fetch(`${API_URL}/instruments`);
            const data = await response.json();
            if (response.ok && data.success && ((_a = data.instruments) === null || _a === void 0 ? void 0 : _a.length))
                instruments = data.instruments;
        }
        catch (requestError) {
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
    form === null || form === void 0 ? void 0 : form.addEventListener("submit", async (event) => {
        var _a;
        event.preventDefault();
        if (!nameInput || !emailInput || !passwordInput || !confirmInput || !instrumentSelect)
            return;
        ["nameError", "emailError", "passwordError", "confirmPasswordError", "instrumentError"].forEach((id) => error(id, ""));
        if (status)
            status.textContent = "";
        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const instrumentSlug = instrumentSelect.value;
        let valid = true;
        if (!name) {
            error("nameError", "Informe seu nome.");
            valid = false;
        }
        if (!validEmail(email)) {
            error("emailError", "Digite um e-mail válido.");
            valid = false;
        }
        if (passwordInput.value.length < 6) {
            error("passwordError", "A senha deve ter pelo menos 6 caracteres.");
            valid = false;
        }
        if (passwordInput.value !== confirmInput.value) {
            error("confirmPasswordError", "As senhas não coincidem.");
            valid = false;
        }
        if (!instrumentSlug) {
            error("instrumentError", "Escolha um instrumento ou objetivo.");
            valid = false;
        }
        if (!valid)
            return;
        try {
            const response = await fetch(`${API_URL}/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password: passwordInput.value }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                error(((_a = data.message) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes("e-mail")) ? "emailError" : "passwordError", data.message || "Não foi possível criar a conta.");
                return;
            }
            // O instrumento escolhido só pode ser salvo no perfil quando existir uma
            // sessão autenticada (access_token). Como a confirmação de e-mail está
            // ativa, isso normalmente só acontece no primeiro login — por isso a
            // escolha fica guardada localmente até lá (script.ts lê essa chave).
            try {
                localStorage.setItem(PENDING_INSTRUMENT_KEY, instrumentSlug);
            }
            catch ( /* localStorage indisponível, segue sem guardar */_b) { /* localStorage indisponível, segue sem guardar */ }
            if (data.user)
                localStorage.setItem("theInstrumentalistUser", JSON.stringify(data.user));
            if (status)
                status.textContent = data.message || "Conta criada com sucesso.";
            if (data.user)
                window.setTimeout(() => { window.location.href = "home.html"; }, 700);
            else
                window.setTimeout(() => { window.location.href = "login.html"; }, 1800);
        }
        catch (requestError) {
            error("passwordError", "Não foi possível conectar ao servidor.");
            console.error(requestError);
        }
    });
    loadInstruments();
})();
