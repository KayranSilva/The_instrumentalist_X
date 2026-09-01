(function(){
  "use strict";

  // ---------- Mobile nav toggle ----------
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');

  if(navToggle && navLinks){
    navToggle.addEventListener('click', function(){
      var isOpen = navLinks.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.querySelectorAll('a').forEach(function(link){
      link.addEventListener('click', function(){
        navLinks.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ---------- Lesson filter tabs ----------
  var filterTabs = document.getElementById('filterTabs');
  var lessonCards = document.querySelectorAll('.lesson-card');

  if(filterTabs){
    filterTabs.addEventListener('click', function(e){
      var btn = e.target.closest('.filter-tab');
      if(!btn) return;

      filterTabs.querySelectorAll('.filter-tab').forEach(function(t){
        t.classList.remove('active');
      });
      btn.classList.add('active');

      var filter = btn.getAttribute('data-filter');
      lessonCards.forEach(function(card){
        var match = filter === 'all' || card.getAttribute('data-instrument') === filter;
        card.classList.toggle('is-hidden', !match);
      });
    });
  }

  // ---------- Animate progress bars on load ----------
  function animateProgress(){
    document.querySelectorAll('.progress-fill[data-progress]').forEach(function(bar){
      var value = bar.getAttribute('data-progress');
      requestAnimationFrame(function(){
        bar.style.width = value + '%';
      });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', animateProgress);
  } else {
    animateProgress();
  }

  // ---------- User chip (placeholder menu hook) ----------
  var userChip = document.getElementById('userChip');
  if(userChip){
    userChip.addEventListener('click', function(){
      // Ponto de integração: abra aqui o menu de conta / logout.
      console.log('Abrir menu de usuário');
    });
  }

})();
