(function(){
  "use strict";

  var API_URL = 'http://127.0.0.1:8001';

  function getUserFromStorage(){
    try {
      var user = JSON.parse(localStorage.getItem('theInstrumentalistUser') || 'null');
      return user && user.email ? user : null;
    } catch (error) {
      return null;
    }
  }

  function renderHomepage(data){
    if (!data || !data.success) {
      return;
    }

    var user = data.user || {};
    var hero = data.hero || {};
    var lessons = data.lessons || [];
    var instruments = data.instruments || [];
    var journey = data.journey || {};

    var userName = document.querySelector('.user-name');
    if (userName) {
      userName.textContent = user.name || 'Marina';
    }

    var heroTitle = document.querySelector('.hero-greet h1');
    if (heroTitle && hero.greeting) {
      heroTitle.textContent = hero.greeting;
    }

    var heroParagraph = document.querySelector('.hero-greet p');
    if (heroParagraph && hero.message) {
      heroParagraph.textContent = hero.message;
    }

    var continueTag = document.querySelector('.continue-info .tag');
    var continueTitle = document.querySelector('.continue-info h3');
    var progressLabel = document.querySelector('.continue-info .progress-label');
    var continueProgress = document.querySelector('.continue-info .progress-fill');

    if (continueTag && hero.continue_lesson) {
      continueTag.textContent = hero.continue_lesson.instrument + ' · ' + hero.continue_lesson.module;
    }
    if (continueTitle && hero.continue_lesson) {
      continueTitle.textContent = hero.continue_lesson.title;
    }
    if (progressLabel && hero.continue_lesson) {
      progressLabel.textContent = hero.continue_lesson.progress + '% concluído · ' + hero.continue_lesson.time_remaining;
    }
    if (continueProgress && hero.continue_lesson) {
      continueProgress.setAttribute('data-progress', String(hero.continue_lesson.progress));
      continueProgress.style.width = hero.continue_lesson.progress + '%';
    }

    var lessonRow = document.getElementById('lessonRow');
    if (lessonRow) {
      lessonRow.innerHTML = '';
      lessons.forEach(function(lesson){
        var article = document.createElement('article');
        article.className = 'lesson-card';
        article.setAttribute('data-instrument', lesson.instrument);

        var card = document.createElement('div');
        card.className = 'lesson-thumb lesson-thumb--violet';
        if (lesson.instrument === 'piano') {
          card.className = 'lesson-thumb lesson-thumb--teal';
        }
        if (lesson.instrument === 'bateria') {
          card.className = 'lesson-thumb lesson-thumb--yellow';
        }
        if (lesson.instrument === 'canto') {
          card.className = 'lesson-thumb lesson-thumb--violet';
        }

        card.innerHTML = '<button class="play-btn" aria-label="Assistir ' + lesson.title + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7Z"/></svg></button><span class="lesson-duration">' + lesson.duration + '</span>' + (lesson.badge ? '<span class="lesson-badge">' + lesson.badge + '</span>' : '');

        var tag = document.createElement('span');
        tag.className = 'lesson-tag';
        tag.textContent = lesson.instrument === 'violao' ? 'Violão' : lesson.instrument === 'piano' ? 'Piano' : lesson.instrument === 'bateria' ? 'Bateria' : lesson.instrument === 'canto' ? 'Canto' : 'Instrumento';

        var title = document.createElement('h3');
        title.textContent = lesson.title;

        var teacher = document.createElement('p');
        teacher.className = 'lesson-teacher';
        teacher.textContent = 'com ' + lesson.teacher;

        var track = document.createElement('div');
        track.className = 'progress-track progress-track--sm';
        var fill = document.createElement('div');
        fill.className = 'progress-fill';
        fill.setAttribute('data-progress', String(lesson.progress));
        fill.style.width = '0%';
        track.appendChild(fill);

        article.appendChild(card);
        article.appendChild(tag);
        article.appendChild(title);
        article.appendChild(teacher);
        article.appendChild(track);
        lessonRow.appendChild(article);
      });
    }

    var instrumentGrid = document.querySelector('.instrument-grid');
    if (instrumentGrid) {
      instrumentGrid.innerHTML = '';
      instruments.forEach(function(item){
        var link = document.createElement('a');
        link.className = 'instrument-card';
        link.href = '#lessons';
        link.innerHTML = '<span class="instrument-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">' + getInstrumentSvg(item.icon) + '</svg></span><h3>' + item.name + '</h3><span class="instrument-meta">' + item.meta + '</span>';
        instrumentGrid.appendChild(link);
      });
    }

    var level = document.querySelector('.level-ring-inner b');
    if (level && journey.level) {
      level.textContent = journey.level;
    }

    var journeyText = document.querySelector('.level-info p');
    if (journeyText && journey.xp_needed) {
      journeyText.textContent = 'Faltam ' + journey.xp_needed + ' XP para o nível ' + (journey.level + 1) + ' — continue praticando para desbloquear o desafio semanal.';
    }

    var journeyProgress = document.querySelector('.level-info .progress-fill');
    if (journeyProgress && journey.progress) {
      journeyProgress.setAttribute('data-progress', String(journey.progress));
      journeyProgress.style.width = journey.progress + '%';
    }

    var progressLabel = document.querySelector('.level-info .progress-label');
    if (progressLabel && journey.xp_current && journey.xp_goal) {
      progressLabel.textContent = journey.xp_current + ' / ' + journey.xp_goal + ' XP';
    }

    var leaderboardList = document.querySelector('.leaderboard-list');
    if (leaderboardList && Array.isArray(journey.ranking)) {
      leaderboardList.innerHTML = '';
      journey.ranking.forEach(function(entry){
        var item = document.createElement('li');
        if (entry.is_you) item.className = 'is-you';
        item.innerHTML = '<span class="rank">' + entry.rank + '</span><span class="avatar avatar--sm">' + entry.avatar + '</span><span class="lb-name">' + entry.name + '</span><span class="lb-xp">' + entry.xp + ' XP</span>';
        leaderboardList.appendChild(item);
      });
    }
  }

  function getInstrumentSvg(icon){
    var map = {
      violao: '<path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
      piano: '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M7 6v12M11 6v12M15 6v12"/>',
      bateria: '<ellipse cx="12" cy="8" rx="7" ry="3"/><path d="M5 8v7a7 3 0 0 0 14 0V8"/><path d="M12 15v4"/>',
      violino: '<path d="M12 3c2.5 0 3 1.6 3 3s-1 2-1 3.5c2 .5 3.5 2.5 3.5 5A5.5 5.5 0 1 1 6.5 9c1.5 0 2-1 2-2 0-1.4.5-4 3.5-4Z"/><circle cx="12" cy="14.5" r="1.4"/>',
      ukulele: '<path d="M10 17V7l6-1.2V15"/><circle cx="7.5" cy="17" r="2.5"/><circle cx="14" cy="15" r="2.5"/>',
      canto: '<path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
    };
    return map[icon] || map.violao;
  }

  async function loadHomepage(){
    var user = getUserFromStorage();
    var email = user && user.email ? user.email : 'marina@theinstrumentalist.com';

    try {
      var response = await fetch(API_URL + '/homepage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      });

      var data = await response.json();
      renderHomepage(data);
    } catch (error) {
      console.error('Erro ao carregar homepage:', error);
    }
  }

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
