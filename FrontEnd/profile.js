(() => {
  "use strict";
  const user = AppSession.requireUser();
  if (!user) return;

  const $ = (id) => document.getElementById(id);
  const esc = AppSession.escapeHtml;
  const requestedId = new URLSearchParams(window.location.search).get("id");
  const profileId = requestedId || user.id;
  const isOwnProfile = profileId === user.id;
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId);

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function roleName(role) {
    return role === "admin" ? "Administrador" : role === "teacher" ? "Professor" : "Membro";
  }

  function avatar(profile) {
    if (profile.avatar_url) {
      return `<img class="profile-avatar-image" src="${esc(profile.avatar_url)}" alt="">`;
    }
    return `<span class="profile-avatar-fallback">${esc(AppSession.initial(profile.display_name))}</span>`;
  }

  function renderPost(post, profile) {
    return `<article class="post-card">
      <div class="post-head">
        <span class="avatar">${avatar(profile)}</span>
        <div class="person-meta"><strong>${esc(profile.display_name || "Músico")}</strong><small>${esc(formatDate(post.created_at))}</small></div>
      </div>
      ${post.body ? `<p class="post-body">${esc(post.body)}</p>` : ""}
      ${post.music_url ? `<a class="music-link" href="${esc(post.music_url)}" target="_blank" rel="noopener noreferrer"><span class="play">▶</span><span><strong>${esc(post.music_title || "Ouvir música compartilhada")}</strong><small>Abrir link musical ↗</small></span></a>` : ""}
    </article>`;
  }

  async function loadProfile() {
    if (!validId) {
      $("profileCard").innerHTML = '<div class="empty">Este perfil não foi encontrado.</div>';
      $("profileFeed").innerHTML = "";
      return;
    }
    try {
      const data = await AppSession.api(`/community/profile?id=${encodeURIComponent(profileId)}`);
      const profile = data.profile;
      const name = profile.display_name || "Músico";
      $("profileCard").innerHTML = `<div class="profile-identity">
        <span class="profile-avatar">${avatar(profile)}</span>
        <div class="profile-copy"><span class="eyebrow">PERFIL MUSICAL</span><h1>${esc(name)}</h1><span class="role-pill">${esc(roleName(profile.role))}</span></div>
        ${isOwnProfile ? '<span class="profile-owner-tag">Este é o seu perfil</span>' : `<button id="followProfile" class="follow-btn ${data.is_following ? "following" : ""}" type="button" data-following="${data.is_following}">${data.is_following ? "Seguindo ✓" : "Seguir +"}</button>`}
      </div>
      <div class="profile-stats"><div><strong>${data.posts.length}</strong><span>publicações</span></div><div><strong id="followerCount">${data.follower_count}</strong><span>seguidores</span></div><div><strong>${data.following_count}</strong><span>seguindo</span></div></div>`;
      $("profileFeedTitle").textContent = isOwnProfile ? "Minhas publicações" : `Publicações de ${name}`;
      $("profileFeed").innerHTML = data.posts.length
        ? data.posts.map((post) => renderPost(post, profile)).join("")
        : '<div class="empty">Ainda não há publicações por aqui. ♫</div>';
      $("followProfile")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const result = await AppSession.api("/community/follow", {
            method: "POST",
            json: { user_id: profileId },
          });
          button.dataset.following = String(result.following);
          button.classList.toggle("following", result.following);
          button.textContent = result.following ? "Seguindo ✓" : "Seguir +";
          button.disabled = false;
          $("followerCount").textContent = String(Number($("followerCount").textContent) + (result.following ? 1 : -1));
        } catch (error) {
          button.disabled = false;
          $("profileFeedback").textContent = error.message || "Não foi possível atualizar o seguimento.";
          $("profileFeedback").hidden = false;
        }
      });
    } catch (error) {
      $("profileCard").innerHTML = `<div class="empty">${esc(error.message || "Não foi possível carregar este perfil.")}</div>`;
      $("profileFeed").innerHTML = "";
    }
  }

  $("logout").addEventListener("click", () => AppSession.logout());
  loadProfile();
})();
