(() => {
  "use strict";
  const user = AppSession.requireUser(); if (!user) return;
  const $ = (id) => document.getElementById(id);
  const esc = AppSession.escapeHtml;
  let state = { user_id: user.id, posts: [], comments: [], liked_post_ids: [], following_ids: [], follower_ids: [], profiles: [], groups: [], joined_group_ids: [], group_posts: [], announcements: [] };
  let activeGroup = null;
  const initials = (name) => esc((name || "Músico").trim().split(/\s+/).slice(0, 2).map(x => x[0] || "").join("").toUpperCase());
  const nameOf = (id) => state.profiles.find(p => p.id === id)?.display_name || (id === state.user_id ? user.name : "Membro da comunidade");
  const profileOf = (id) => state.profiles.find(p => p.id === id) || {};
  const profileLink = (id) => `profile.html?id=${encodeURIComponent(id)}`;
  function toast(message, kind = "success") { const el = $("toast"); el.textContent = message; el.className = `toast ${kind}`; el.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => el.hidden = true, 3500); }
  async function api(path, options = {}) { return AppSession.api(path, options); }
  function date(value) { try { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); } catch { return "Agora"; } }
  function avatar(id) { const p = profileOf(id); return `<span class="avatar">${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : initials(nameOf(id))}</span>`; }
  async function load() { try { state = { ...state, ...await api("/community") }; render(); } catch (e) { toast(e.message || "Não foi possível carregar a comunidade.", "error"); $("feed").innerHTML = `<div class="empty">Não foi possível carregar as publicações.<br>Confira se a migração da Comunidade foi aplicada no Supabase.</div>`; } }
  function render() { renderFeed(); renderPeople(); renderGroups(); renderAnnouncements(); $("announcementForm").hidden = !["teacher", "admin"].includes(user.role); }
  function renderFeed() {
    const host = $("feed");
    if (!state.posts.length) { host.innerHTML = '<div class="empty">Ainda não há publicações. Seja a primeira pessoa a compartilhar algo! ♫</div>'; return; }
    host.innerHTML = state.posts.map(post => {
      const p = profileOf(post.author_id), comments = state.comments.filter(c => c.post_id === post.id), liked = state.liked_post_ids.includes(post.id);
      return `<article class="post-card"><div class="post-head">${avatar(post.author_id)}<div class="person-meta"><strong><a class="profile-link" href="${profileLink(post.author_id)}">${esc(nameOf(post.author_id))}</a></strong><small>${date(post.created_at)}</small></div>${p.role === "teacher" || p.role === "admin" ? '<span class="role-pill">Professor</span>' : ''}</div>${post.body ? `<p class="post-body">${esc(post.body)}</p>` : ''}${post.music_url ? `<a class="music-link" href="${esc(post.music_url)}" target="_blank" rel="noopener noreferrer"><span class="play">▶</span><span><strong>${esc(post.music_title || "Ouvir música compartilhada")}</strong><small>Abrir link musical ↗</small></span></a>` : ''}<div class="post-actions"><button class="action-btn ${liked ? 'liked' : ''}" data-like="${post.id}">${liked ? '♥ Curtido' : '♡ Curtir'}</button><span class="action-btn">▢ ${comments.length} comentário(s)</span></div><div class="comments">${comments.map(c => `<p class="comment"><strong><a class="profile-link" href="${profileLink(c.author_id)}">${esc(nameOf(c.author_id))}</a>:</strong> ${esc(c.body)}</p>`).join('')}<form class="comment-form" data-comment="${post.id}"><input name="body" maxlength="1200" required placeholder="Escreva um comentário…" aria-label="Comentário"><button class="primary" type="submit">Enviar</button></form></div></article>`;
    }).join("");
  }
  function renderPeople() {
    const host = $("peopleList"), people = state.profiles.filter(p => p.id !== state.user_id).slice(0, 12);
    if (!people.length) { host.innerHTML = '<div class="empty">Outros membros aparecerão aqui quando se cadastrarem.</div>'; return; }
    host.innerHTML = people.map(p => { const following = state.following_ids.includes(p.id), mutual = following && state.follower_ids.includes(p.id); return `<div class="person-row">${avatar(p.id)}<div class="person-meta"><strong><a class="profile-link" href="${profileLink(p.id)}">${esc(p.display_name || "Músico")}</a></strong><small>${mutual ? 'Amigos · seguimento mútuo' : p.role === 'admin' ? 'Administrador' : p.role === 'teacher' ? 'Professor' : 'Membro'}</small><a class="person-profile-link" href="${profileLink(p.id)}">Ver perfil</a></div><button class="follow-btn ${following ? 'following' : ''}" data-follow="${p.id}">${following ? 'Seguindo ✓' : 'Seguir +'}</button></div>`; }).join("");
  }
  function renderGroups() {
    const host = $("groups");
    if (!state.groups.length) host.innerHTML = '<div class="empty">Ainda não há grupos. Crie o primeiro e reúna pessoas para praticar!</div>';
    else host.innerHTML = state.groups.map(g => { const joined = state.joined_group_ids.includes(g.id); return `<article class="group-card"><h3>${esc(g.name)}</h3><p>${esc(g.description || 'Um espaço para conversar e praticar música.')}</p><div class="group-meta"><small>Por ${esc(nameOf(g.owner_id))}</small><button class="follow-btn ${joined ? 'following' : ''}" data-join="${g.id}">${joined ? 'Sair do grupo' : 'Participar +'}</button></div><button class="action-btn" data-open-group="${g.id}">Abrir conversas →</button></article>`; }).join("");
    if (activeGroup) showGroup(activeGroup);
  }
  function showGroup(id) {
    activeGroup = id; const g = state.groups.find(x => x.id === id); const box = $("groupDetail");
    if (!g) { box.hidden = true; return; }
    const joined = state.joined_group_ids.includes(id), posts = state.group_posts.filter(p => p.group_id === id);
    box.hidden = false; box.innerHTML = `<div class="section-title"><div><h3>${esc(g.name)}</h3><p>${esc(g.description || '')}</p></div><button class="quiet" id="closeGroup">Fechar</button></div>${joined ? `<form id="groupPostForm"><input name="body" maxlength="2000" required placeholder="Compartilhe algo com o grupo"><button class="primary" type="submit">Enviar</button></form>` : '<p class="comment">Participe do grupo para enviar mensagens.</p>'}<div class="stack" style="margin-top:14px">${posts.length ? posts.map(p => `<div class="announcement"><h3><a class="profile-link" href="${profileLink(p.author_id)}">${esc(nameOf(p.author_id))}</a></h3><p>${esc(p.body)}</p><time>${date(p.created_at)}</time></div>`).join('') : '<div class="empty">Nenhuma conversa ainda.</div>'}</div>`;
    $("closeGroup")?.addEventListener("click", () => { activeGroup = null; box.hidden = true; });
    $("groupPostForm")?.addEventListener("submit", async e => { e.preventDefault(); const body = new FormData(e.currentTarget).get("body"); try { await api("/community/groups/posts", { method: "POST", json: { group_id: id, body } }); toast("Mensagem enviada ao grupo."); await load(); } catch (err) { toast(err.message, "error"); } });
  }
  function renderAnnouncements() { const host = $("announcements"); if (!state.announcements.length) { host.innerHTML = '<div class="empty">Os informes oficiais aparecerão aqui.</div>'; return; } host.innerHTML = state.announcements.map(a => `<article class="announcement"><time>${date(a.created_at)}</time><h3>${esc(a.title)}</h3><p>${esc(a.body)}</p></article>`).join(""); }
  $("postBody").addEventListener("input", e => $("postCount").textContent = `${e.target.value.length} / 3000`);
  $("postForm").addEventListener("submit", async e => { e.preventDefault(); const body = $("postBody").value.trim(), music_url = $("musicUrl").value.trim(), music_title = $("musicTitle").value.trim(); try { await api("/community/posts", { method: "POST", json: { body, music_url, music_title } }); e.currentTarget.reset(); $("postCount").textContent = "0 / 3000"; toast("Publicação compartilhada!"); await load(); } catch (err) { toast(err.message, "error"); } });
  $("feed").addEventListener("click", async e => { const like = e.target.closest("[data-like]"); if (like) { try { await api("/community/likes", { method: "POST", json: { post_id: like.dataset.like } }); await load(); } catch (err) { toast(err.message, "error"); } }
  });
  $("feed").addEventListener("submit", async e => { const form = e.target.closest("[data-comment]"); if (!form) return; e.preventDefault(); const body = new FormData(form).get("body"); try { await api("/community/comments", { method: "POST", json: { post_id: form.dataset.comment, body } }); await load(); toast("Comentário publicado."); } catch (err) { toast(err.message, "error"); } });
  $("peopleList").addEventListener("click", async e => { const btn = e.target.closest("[data-follow]"); if (!btn) return; try { const result = await api("/community/follow", { method: "POST", json: { user_id: btn.dataset.follow } }); toast(result.message || "Estado de seguimento atualizado."); await load(); } catch (err) { toast(err.message, "error"); } });
  $("groupForm").addEventListener("submit", async e => { e.preventDefault(); try { await api("/community/groups", { method: "POST", json: { name: $("groupName").value.trim(), description: $("groupDescription").value.trim() } }); e.currentTarget.reset(); toast("Grupo criado!"); await load(); } catch (err) { toast(err.message, "error"); } });
  $("groups").addEventListener("click", async e => { const join = e.target.closest("[data-join]"); if (join) { try { const result = await api("/community/groups/join", { method: "POST", json: { group_id: join.dataset.join } }); toast(result.joined ? "Você entrou no grupo." : "Você saiu do grupo."); await load(); } catch (err) { toast(err.message, "error"); } } const open = e.target.closest("[data-open-group]"); if (open) showGroup(open.dataset.openGroup); });
  $("announcementForm").addEventListener("submit", async e => { e.preventDefault(); try { await api("/community/announcements", { method: "POST", json: { title: $("announcementTitle").value.trim(), body: $("announcementBody").value.trim() } }); e.currentTarget.reset(); toast("Informe oficial publicado."); await load(); } catch (err) { toast(err.message, "error"); } });
  $("refresh").addEventListener("click", load); $("logout").addEventListener("click", () => AppSession.logout());
  load();
})();
