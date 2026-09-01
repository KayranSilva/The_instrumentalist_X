(function(){
  "use strict";

  var API_URL = 'http://127.0.0.1:8001';

  var toggleBtn = document.getElementById('togglePassword');
  var passwordInput = document.getElementById('password');

  if(toggleBtn && passwordInput){
    toggleBtn.addEventListener('click', function(){
      var isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      toggleBtn.setAttribute('aria-pressed', String(isPassword));
      toggleBtn.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
    });
  }

  var loginForm = document.getElementById('loginForm');
  var emailInput = document.getElementById('email');
  var emailError = document.getElementById('emailError');
  var passwordError = document.getElementById('passwordError');

  function isValidEmail(value){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function submitLogin(event){
    event.preventDefault();
    var valid = true;

    emailError.textContent = '';
    passwordError.textContent = '';

    if(!emailInput.value.trim()){
      emailError.textContent = 'Informe seu e-mail.';
      valid = false;
    } else if(!isValidEmail(emailInput.value.trim())){
      emailError.textContent = 'Digite um e-mail válido.';
      valid = false;
    }

    if(!passwordInput.value){
      passwordError.textContent = 'Informe sua senha.';
      valid = false;
    } else if(passwordInput.value.length < 6){
      passwordError.textContent = 'A senha deve ter pelo menos 6 caracteres.';
      valid = false;
    }

    if(!valid) return;

    try {
      var response = await fetch(API_URL + '/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email: emailInput.value.trim(),
          password: passwordInput.value,
          remember: document.getElementById('remember').checked
        })
      });

      var data = await response.json();

      if(response.ok && data.success){
        window.location.href = 'home.html';
        return;
      }

      if(data.message){
        if(data.message.toLowerCase().includes('e-mail') || data.message.toLowerCase().includes('inválido')){
          emailError.textContent = data.message;
        } else {
          passwordError.textContent = data.message;
        }
      }
    } catch (error) {
      passwordError.textContent = 'Não foi possível conectar ao servidor de login.';
      console.error(error);
    }
  }

  if(loginForm){
    loginForm.addEventListener('submit', submitLogin);
  }

  var overlay = document.getElementById('modalOverlay');
  var modalTitle = document.getElementById('modalTitle');
  var modalSub = document.getElementById('modalSub');
  var modalClose = document.getElementById('modalClose');
  var recoveryForm = document.getElementById('recoveryForm');
  var recoveryEmail = document.getElementById('recoveryEmail');
  var recoveryError = document.getElementById('recoveryError');
  var modalFeedback = document.getElementById('modalFeedback');
  var lastFocused = null;

  function openModal(mode){
    lastFocused = document.activeElement;
    if(mode === 'login'){
      modalTitle.textContent = 'Recuperar meu login';
      modalSub.textContent = 'Informe um e-mail alternativo ou telefone e enviaremos o nome de usuário associado à sua conta.';
    } else {
      modalTitle.textContent = 'Recuperar acesso';
      modalSub.textContent = 'Informe o e-mail associado à sua conta e enviaremos um link para redefinir sua senha.';
    }
    recoveryForm.style.display = '';
    modalFeedback.classList.remove('show');
    recoveryError.textContent = '';
    recoveryEmail.value = '';
    overlay.classList.add('open');
    setTimeout(function(){ recoveryEmail.focus(); }, 50);
  }

  function closeModal(){
    overlay.classList.remove('open');
    if(lastFocused) lastFocused.focus();
  }

  document.getElementById('forgotPasswordBtn').addEventListener('click', function(){ openModal('password'); });
  document.getElementById('forgotLoginBtn').addEventListener('click', function(){ openModal('login'); });
  document.getElementById('signupBtn').addEventListener('click', function(){
    alert('Ligue este botão à sua página de cadastro.');
  });

  if(modalClose){
    modalClose.addEventListener('click', closeModal);
  }

  if(overlay){
    overlay.addEventListener('click', function(e){
      if(e.target === overlay) closeModal();
    });
  }

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && overlay && overlay.classList.contains('open')) closeModal();
  });

  if(recoveryForm){
    recoveryForm.addEventListener('submit', async function(e){
      e.preventDefault();
      recoveryError.textContent = '';

      if(!recoveryEmail.value.trim() || !isValidEmail(recoveryEmail.value.trim())){
        recoveryError.textContent = 'Digite um e-mail válido.';
        return;
      }

      try {
        var response = await fetch(API_URL + '/recover', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ email: recoveryEmail.value.trim() })
        });

        var data = await response.json();
        if(response.ok && data.success){
          recoveryForm.style.display = 'none';
          modalFeedback.classList.add('show');
          return;
        }

        recoveryError.textContent = data.message || 'Não foi possível recuperar o acesso.';
      } catch (error) {
        recoveryError.textContent = 'Não foi possível conectar ao servidor.';
        console.error(error);
      }
    });
  }

})();
