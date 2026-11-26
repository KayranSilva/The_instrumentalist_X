document.getElementById('year').textContent = '© ' + new Date().getFullYear() + ' The Instrumentalist';

// Menu mobile
const menu = document.getElementById('menu'), toggle = document.getElementById('toggle');
toggle.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
});
menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false');
}));

// Destaca o link da seção atual enquanto a página desce
const links = [...menu.querySelectorAll('a.link')];
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + e.target.id));
    }
  });
}, { rootMargin: '-45% 0px -50% 0px' });
document.querySelectorAll('main section[id]').forEach(s => io.observe(s));

// Barra de progresso de rolagem
const bar = document.getElementById('bar');
addEventListener('scroll', () => { const h = document.documentElement; bar.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight) * 100) + '%' }, { passive: true });

// Notas flutuando no hero
const art = document.querySelector('.hero-art');
['♪', '♫', '♩', '♬', '♪'].forEach((n, i) => { const e = document.createElement('span'); e.className = 'note'; e.textContent = n; e.style.cssText = `left:${10 + i * 20}%;bottom:${10 + (i % 2) * 20}%;animation-delay:${i * 1.4}s`; art.appendChild(e) });

// Revelar ao rolar
const rio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target) } }), { threshold: .15 });
document.querySelectorAll('.card,.who article,.step,.panel,.head,.final h2').forEach((el, i) => { el.classList.add('rv'); el.style.transitionDelay = (i % 3) * 80 + 'ms'; rio.observe(el) });

// Demo: transcrição
const wave = document.getElementById('wave'); for (let i = 0; i < 40; i++) { const b = document.createElement('i'); b.style.animationDelay = (i * 70 % 900) + 'ms'; wave.appendChild(b) }
const result = document.getElementById('result'); let tab = 'score', ready = false;
const ys = [60, 50, 40, 45, 55, 35, 45, 60];
function render() {
  if (!ready) return;
  if (tab === 'score') {
    let g = '<svg viewBox="0 0 320 110">'; for (let l = 0; l < 5; l++)g += `<line x1="6" x2="314" y1="${30 + l * 10}" y2="${30 + l * 10}" stroke="currentColor" opacity=".4"/>`;
    ys.forEach((y, i) => { const x = 30 + i * 35; g += `<g class="n" style="animation-delay:${i * 120}ms"><ellipse cx="${x}" cy="${y + 10}" rx="6" ry="4.5" fill="currentColor" transform="rotate(-18 ${x} ${y + 10})"/><line x1="${x + 5.500}" x2="${x + 5.500}" y1="${y + 10}" y2="${y - 14}" stroke="currentColor" stroke-width="1.5"/></g>` });
    result.innerHTML = g + '</svg>';
  } else if (tab === 'tab') {
    result.innerHTML = '<pre style="margin:0;line-height:1.7">e|--0---3---5---3---0--|\nB|----1---------1------|\nG|--------0---------0--|\nD|----------------------|\nA|----------------------|\nE|----------------------|</pre>';
  } else {
    result.innerHTML = ['C', 'G', 'Am', 'F'].map((c, i) => `<span class="chord" style="animation-delay:${i * 150}ms">${c}</span>`).join('') + '<p style="font-family:Poppins,sans-serif;margin-top:10px;color:#5E5878;font-size:.9rem">Progressão detectada: I – V – vi – IV</p>';
  }
}
document.getElementById('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.t; document.querySelectorAll('#tabs button').forEach(x => x.setAttribute('aria-selected', x === b)); render() });
const tr = document.getElementById('transcribe');
tr.addEventListener('click', () => {
  tr.disabled = true; tr.textContent = 'Ouvindo…'; wave.classList.add('on'); result.innerHTML = '<span class="empty">Analisando o áudio…</span>';
  setTimeout(() => { wave.classList.remove('on'); ready = true; tr.disabled = false; tr.textContent = 'Transcrever de novo'; render() }, 1800)
});

// Demo: XP e sequência
let xp = 40, lvl = 1, st = 0; const $ = id => document.getElementById(id);
$('done').addEventListener('click', () => {
  xp += 25; let m = '+25 XP!';
  if (xp >= 100) { xp -= 100; lvl++; m = 'Subiu para o nível ' + lvl + '! 🎉' }
  if (st < 7) { document.querySelectorAll('#days span')[st].classList.add('on'); st++; if (st === 7) m = 'Semana completa! Conquista desbloqueada 🏅' }
  $('xpb').style.width = xp + '%'; $('xpt').textContent = xp + ' / 100 XP'; $('lv').textContent = 'Nível ' + lvl; $('msg').textContent = m
});

// Demo: piano
const notes = [['C', 261.63], ['D', 293.66], ['E', 329.63], ['F', 349.23], ['G', 392], ['A', 440], ['B', 493.88], ['C', 523.25]], keys = 'asdfghjk'; let ctx, hist = [];
const piano = $('piano');
notes.forEach((n, i) => { const k = document.createElement('button'); k.className = 'key'; k.type = 'button'; k.textContent = n[0]; k.setAttribute('aria-label', 'Nota ' + n[0]); piano.appendChild(k); k._p = () => play(i, k); k.addEventListener('pointerdown', k._p) });
function play(i, k) {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = notes[i][1]; g.gain.setValueAtTime(.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.35, ctx.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + 1.1); o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 1.2);
  k.classList.add('down'); setTimeout(() => k.classList.remove('down'), 160); hist.push(notes[i][0]); hist = hist.slice(-12); $('played').textContent = hist.join(' · ')
}
addEventListener('keydown', e => { if (e.repeat || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; const i = keys.indexOf(e.key.toLowerCase()); if (i > -1) piano.children[i]._p() });

// Header: some ao descer, volta ao subir; sombra ao rolar
const top_ = document.querySelector('.topbar'); let ly = scrollY;
addEventListener('scroll', () => {
  const y = scrollY; top_.classList.toggle('scrolled', y > 10);
  if (!menu.classList.contains('open')) top_.classList.toggle('hide', y > ly && y > 240); ly = y
}, { passive: true });

// Pílula deslizante no menu
const pill = document.getElementById('pill');
function mv(el) { if (!el || innerWidth <= 820) { pill.style.opacity = 0; return } pill.style.opacity = 1; pill.style.left = el.offsetLeft + 'px'; pill.style.width = el.offsetWidth + 'px' }
const act = () => menu.querySelector('.active');
links.forEach(l => l.addEventListener('mouseenter', () => mv(l)));
menu.addEventListener('mouseleave', () => mv(act()));
links.forEach(l => l.addEventListener('focus', () => mv(l)));
new MutationObserver(() => mv(act())).observe(menu, { attributes: true, subtree: true, attributeFilter: ['class'] });
addEventListener('resize', () => mv(act()));

// Hero: brilho que segue o mouse e pássaro com leve parallax
const hero = document.querySelector('.hero');
hero.addEventListener('pointermove', e => {
  const r = hero.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  hero.style.setProperty('--mx', x + 'px'); hero.style.setProperty('--my', y + 'px');
  art.style.transform = `translate(${(x / r.width - .5) * -22}px,${(y / r.height - .5) * -22}px)`
});
hero.addEventListener('pointerleave', () => art.style.transform = '');

// Botões magnéticos + ondinha no clique
document.querySelectorAll('.mag').forEach(b => {
  b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px,${(e.clientY - r.top - r.height / 2) * .28}px)` });
  b.addEventListener('pointerleave', () => b.style.transform = '')
});
document.querySelectorAll('.btn').forEach(b => b.addEventListener('pointerdown', e => {
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height), s = document.createElement('span');
  s.className = 'rip'; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`; b.appendChild(s); setTimeout(() => s.remove(), 600)
}));

// Títulos: palavra por palavra
document.querySelectorAll('section:not(.hero) h2').forEach(h => {
  let n = 0;
  (function walk(node) {
    [...node.childNodes].forEach(c => {
      if (c.nodeType === 3) {
        const f = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(t => {
          if (!t) return; if (/^\s+$/.test(t)) { f.appendChild(document.createTextNode(' ')); return }
          const w = document.createElement('span'); w.className = 'w'; const i = document.createElement('span'); i.style.setProperty('--i', n++); i.textContent = t; w.appendChild(i); f.appendChild(w)
        });
        c.replaceWith(f)
      } else if (c.nodeType === 1) walk(c)
    })
  })(h)
});

// Caixas: inclinação 3D + brilho que segue o mouse
document.querySelectorAll('.card,.who article,.step,.panel:not(.piano-panel)').forEach(c => {
  c.classList.add('fx');
  c.addEventListener('pointerenter', () => { c.style.transitionDelay = '0s'; c.classList.add('tilt') });
  c.addEventListener('pointermove', e => {
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.style.setProperty('--cx', x * 100 + '%'); c.style.setProperty('--cy', y * 100 + '%');
    c.style.transform = `perspective(900px) rotateX(${(.5 - y) * 7}deg) rotateY(${(x - .5) * 9}deg) translateY(-6px)`
  });
  c.addEventListener('pointerleave', () => { c.classList.remove('tilt'); c.style.transform = '' })
});

// Faixa de frases: anda sozinha e acelera quando você rola
const mq = $('mq'), mi = ['Aprenda no seu ritmo', 'Transcrição com IA', 'Jornada gamificada', 'Comunidade que acolhe', 'Música é expressão'];
mq.innerHTML = mi.map(t => `<span>${t}</span><span class="d">♪</span>`).join('').repeat(4);
let mx = 0, sv = 0, lastY = scrollY; const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
addEventListener('scroll', () => { sv = scrollY - lastY; lastY = scrollY }, { passive: true });
if (!calm) (function loop() { sv *= .9; const half = mq.scrollWidth / 2; mx -= .7 + sv * .25; if (mx <= -half) mx += half; if (mx > 0) mx -= half; mq.style.transform = `translateX(${mx}px)`; requestAnimationFrame(loop) })();
