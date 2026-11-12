(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const requiredIds = [
    "auth-section", "app-section", "auth-form", "email", "password",
    "session-form", "profile-form", "sessions-list", "toast"
  ];
  if (requiredIds.some((id) => !$(id))) {
    console.error("À Thouars de Jouer : certains éléments HTML sont manquants.");
    return;
  }
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_PUBLISHABLE_KEY) {
    showToast("Configuration Supabase introuvable. Vérifie que config.js est présent.");
    return;
  }

  const client = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_PUBLISHABLE_KEY
  );

  let authMode = "login";
  let currentUser = null;
  let currentProfile = null;
  let toastTimer = null;

  function showToast(message) {
    const el = $("toast");
    if (!el) return;
    el.textContent = String(message || "");
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
  }

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  const isStaff = () => ["admin", "super_admin"].includes(currentProfile?.role);
  const today = () => new Date().toLocaleDateString("en-CA");

  function dateText(value) {
    if (!value) return "Date à définir";
    const date = new Date(value + "T12:00:00");
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString("fr-FR", {
          weekday: "long", day: "numeric", month: "long", year: "numeric"
        });
  }

  function setMode(mode) {
    authMode = mode === "signup" ? "signup" : "login";
    document.querySelectorAll("[data-auth-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.authTab === authMode);
    });
    $("name-fields").classList.toggle("hidden", authMode !== "signup");
    $("username").required = authMode === "signup";
    $("username").disabled = authMode !== "signup";
    $("first-name").required = authMode === "signup";
    $("auth-submit").innerHTML = authMode === "signup"
      ? 'Créer mon compte <span>→</span>'
      : 'Se connecter <span>→</span>';
    $("password").autocomplete = authMode === "signup" ? "new-password" : "current-password";
  }

  function validUsername(username) {
    return /^[A-Za-z0-9_-]{3,20}$/.test(username);
  }

  async function refreshAuth() {
    const { data, error } = await client.auth.getSession();
    if (error) {
      showToast("Connexion impossible : " + error.message);
      return;
    }
    currentUser = data.session?.user || null;
    $("auth-section").classList.toggle("hidden", Boolean(currentUser));
    $("app-section").classList.toggle("hidden", !currentUser);
    $("logout-btn").classList.toggle("hidden", !currentUser);

    if (!currentUser) {
      currentProfile = null;
      $("user-label").textContent = "";
      return;
    }
    await loadApp();
  }

  async function loadProfile() {
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error) {
      showToast("Erreur profil : " + error.message);
      return null;
    }
    if (!data) {
      showToast("Profil membre introuvable. Aucun compte n'a été supprimé.");
      return null;
    }

    // Récupère le pseudo déjà enregistré dans les métadonnées si le profil
    // n'a pas encore été synchronisé. Cela ne nécessite aucune modification SQL.
    const metadataUsername = currentUser.user_metadata?.username || "";
    if (!data.username && metadataUsername) {
      const { data: updated, error: updateError } = await client
        .from("profiles")
        .update({ username: metadataUsername })
        .eq("id", currentUser.id)
        .select("*")
        .maybeSingle();
      if (!updateError && updated) Object.assign(data, updated);
    }

    currentProfile = data;
    const username = data.username || "";
    const firstName = (data.first_name || "").trim();
    $("user-label").textContent = (username ? "@" + username + " • " : "") + (firstName || "Mon compte");
    $("welcome-title").textContent = "Bonjour" + (firstName ? " " + firstName : "") + " !";
    $("profile-username").value = username;
    $("profile-first").value = data.first_name || "";
    $("profile-last").value = data.last_name || "";
    $("avatar-preview").src = data.avatar_url || defaultAvatar();
    $("admin-section").classList.toggle("hidden", !isStaff());
    return data;
  }

  function defaultAvatar() {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" rx="18" fill="#eee8ff"/><text x="50%" y="58%" text-anchor="middle" font-size="38">👤</text></svg>';
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  async function loadApp() {
    await loadProfile();
    await Promise.all([loadSessions(), isStaff() ? loadMembers() : Promise.resolve()]);
  }

  async function loadSessions() {
    const box = $("sessions-list");
    box.innerHTML = '<div class="empty-state">Chargement des parties…</div>';

    const { data: sessions, error } = await client
      .from("sessions")
      .select("*")
      .gte("session_date", today())
      .order("session_date", { ascending: true });

    if (error) {
      box.innerHTML = '<div class="empty-state">Impossible de charger les parties : ' +
        escapeHtml(error.message) + "</div>";
      return;
    }
    if (!sessions?.length) {
      box.innerHTML = '<div class="empty-state">🎲 Aucune partie prévue pour le moment. Pourquoi ne pas en créer une ?</div>';
      return;
    }

    const sessionIds = sessions.map((session) => session.id);
    const { data: registrations, error: regError } = await client
      .from("registrations")
      .select("session_id,user_id")
      .in("session_id", sessionIds);

    if (regError) {
      box.innerHTML = '<div class="empty-state">Impossible de charger les inscriptions : ' +
        escapeHtml(regError.message) + "</div>";
      return;
    }

    const rows = registrations || [];
    const userIds = [...new Set(rows.map((row) => row.user_id))];
    let profiles = [];
    if (userIds.length) {
      const { data, error: profileError } = await client
        .from("profiles")
        .select("id,username,first_name,last_name")
        .in("id", userIds);
      if (profileError) {
        box.innerHTML = '<div class="empty-state">Impossible de charger les participants : ' +
          escapeHtml(profileError.message) + "</div>";
        return;
      }
      profiles = data || [];
    }

    const profileMap = Object.fromEntries(profiles.map((profile) => {
      const name = profile.username
        ? "@" + profile.username + (profile.first_name ? " • " + profile.first_name : "")
        : ((profile.first_name || "") + " " + (profile.last_name || "")).trim() || "Membre";
      return [profile.id, name];
    }));

    box.innerHTML = sessions.map((session) => {
      const joinedRows = rows.filter((row) => row.session_id === session.id);
      const full = joinedRows.length >= Number(session.max_players);
      const joined = joinedRows.some((row) => row.user_id === currentUser.id);
      const owner = session.creator_id === currentUser.id;
      const names = joinedRows.map((row) => escapeHtml(profileMap[row.user_id] || "Membre")).join(", ");
      let action = "";
      if (joined) {
        action = `<button class="btn btn-light" type="button" data-unjoin="${escapeHtml(session.id)}">Me désinscrire</button>`;
      } else if (full) {
        action = '<button class="btn btn-light" type="button" disabled>Complet</button>';
      } else {
        action = `<button class="btn btn-primary" type="button" data-join="${escapeHtml(session.id)}">Je m'inscris !</button>`;
      }
      const manage = owner || isStaff()
        ? `<button class="btn btn-light" type="button" data-edit="${escapeHtml(session.id)}">Modifier</button>
           <button class="btn btn-light" type="button" data-delete="${escapeHtml(session.id)}">Supprimer</button>`
        : "";
      return `<article class="session-card">
        <h3>🎲 ${escapeHtml(session.game_name)}</h3>
        <div class="session-meta">
          <span class="pill">📅 ${escapeHtml(dateText(session.session_date))}</span>
          <span class="pill">👥 ${joinedRows.length}/${Number(session.max_players)} joueurs</span>
        </div>
        ${session.description ? `<p class="session-desc">${escapeHtml(session.description)}</p>` : ""}
        <div class="participants">Participants : ${names || "Pas encore de joueur"}</div>
        <div class="card-actions">${action}${manage}</div>
      </article>`;
    }).join("");

    box.querySelectorAll("[data-join]").forEach((button) =>
      button.addEventListener("click", () => register(button.dataset.join)));
    box.querySelectorAll("[data-unjoin]").forEach((button) =>
      button.addEventListener("click", () => unregister(button.dataset.unjoin)));
    box.querySelectorAll("[data-delete]").forEach((button) =>
      button.addEventListener("click", () => deleteSession(button.dataset.delete)));
    box.querySelectorAll("[data-edit]").forEach((button) =>
      button.addEventListener("click", () => editSession(sessions.find((s) => String(s.id) === button.dataset.edit))));
  }

  async function register(sessionId) {
    const { error } = await client.from("registrations").insert({
      session_id: sessionId, user_id: currentUser.id
    });
    if (error) {
      showToast(error.code === "23505" ? "Tu es déjà inscrit." : error.message);
    } else {
      showToast("Inscription confirmée ! 🎉");
    }
    await loadSessions();
  }

  async function unregister(sessionId) {
    const { error } = await client.from("registrations")
      .delete().eq("session_id", sessionId).eq("user_id", currentUser.id);
    showToast(error ? error.message : "Désinscription effectuée.");
    await loadSessions();
  }

  async function deleteSession(sessionId) {
    if (!confirm("Supprimer définitivement cette partie ?")) return;
    const { error } = await client.from("sessions").delete().eq("id", sessionId);
    showToast(error ? error.message : "Partie supprimée.");
    await loadSessions();
  }

  async function editSession(session) {
    if (!session) return;
    const game = prompt("Nom du jeu :", session.game_name);
    if (game === null) return;
    const date = prompt("Date (AAAA-MM-JJ) :", session.session_date);
    if (date === null) return;
    const max = prompt("Nombre maximum de joueurs :", session.max_players);
    if (max === null) return;
    const description = prompt("Description (facultative) :", session.description || "");
    if (description === null) return;

    const maxPlayers = Number(max);
    if (!game.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date < today() || !Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 100) {
      showToast("Vérifie le nom, la date et le nombre de joueurs.");
      return;
    }
    const { error } = await client.from("sessions").update({
      game_name: game.trim(),
      session_date: date,
      max_players: maxPlayers,
      description: description.trim() || null
    }).eq("id", session.id);
    showToast(error ? error.message : "Partie modifiée.");
    await loadSessions();
  }

  async function loadMembers() {
    const box = $("admin-members");
    const { data, error } = await client
      .from("profiles")
      .select("id,username,first_name,last_name,role,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      box.textContent = "Impossible de charger les membres : " + error.message;
      return;
    }
    if (!data?.length) {
      box.textContent = "Aucun membre.";
      return;
    }

    const superAdmin = currentProfile?.role === "super_admin";
    box.innerHTML = data.map((member) => {
      const displayName = [
        member.username ? "@" + member.username : "",
        member.first_name || "",
        member.last_name || ""
      ].filter(Boolean).join(" • ") || "Membre";
      const roleLabel = member.role === "super_admin" ? "Super admin" :
        member.role === "admin" ? "Administrateur" : "Membre";
      const roleControl = superAdmin && member.id !== currentUser.id
        ? `<select data-role="${escapeHtml(member.id)}" aria-label="Rôle de ${escapeHtml(displayName)}">
             <option value="member" ${member.role === "member" ? "selected" : ""}>Membre</option>
             <option value="admin" ${member.role === "admin" ? "selected" : ""}>Administrateur</option>
           </select>`
        : `<span class="admin-tag">${roleLabel}</span>`;
      return `<div class="admin-member"><div>${escapeHtml(displayName)}
        <small>${escapeHtml(roleLabel)}</small></div>${roleControl}</div>`;
    }).join("");

    box.querySelectorAll("[data-role]").forEach((select) => {
      select.addEventListener("change", async () => {
        const { error: roleError } = await client.from("profiles")
          .update({ role: select.value }).eq("id", select.dataset.role);
        if (roleError) showToast(roleError.message);
        else {
          showToast("Rôle mis à jour.");
          await loadMembers();
        }
      });
    });
  }

  $("auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("email").value.trim();
    const password = $("password").value;
    const submit = $("auth-submit");
    submit.disabled = true;

    try {
      let result;
      if (authMode === "signup") {
        const username = $("username").value.trim();
        if (!validUsername(username)) {
          showToast("Le pseudo doit contenir 3 à 20 caractères : lettres, chiffres, _ ou -.");
          return;
        }
        result = await client.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: $("first-name").value.trim(),
              last_name: $("last-name").value.trim(),
              username
            }
          }
        });
        if (result.error) throw result.error;
        if (!result.data.session) {
          showToast("Compte créé ! Vérifie ta boîte mail pour confirmer l'inscription.");
          $("auth-form").reset();
          setMode("login");
          return;
        }
        showToast("Compte créé ! Bienvenue 🎉");
      } else {
        result = await client.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        showToast("Connexion réussie !");
      }
      await refreshAuth();
    } catch (error) {
      showToast(error.message || "Une erreur est survenue.");
    } finally {
      submit.disabled = false;
    }
  });

  $("profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = $("profile-username").value.trim();
    if (!validUsername(username)) {
      showToast("Le pseudo doit contenir 3 à 20 caractères : lettres, chiffres, _ ou -.");
      return;
    }
    const { error } = await client.from("profiles").update({
      username,
      first_name: $("profile-first").value.trim(),
      last_name: $("profile-last").value.trim()
    }).eq("id", currentUser.id);

    if (error) {
      showToast(error.code === "23505"
        ? "Ce pseudo est déjà utilisé. Choisis-en un autre."
        : error.message);
    } else {
      showToast("Profil enregistré !");
      await loadProfile();
      if (isStaff()) await loadMembers();
    }
  });

  $("session-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const gameName = $("game-name").value.trim();
    const sessionDate = $("session-date").value;
    const maxPlayers = Number($("max-players").value);
    const description = $("description").value.trim() || null;

    if (!gameName || !sessionDate || sessionDate < today() ||
        !Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 100) {
      showToast("Vérifie le nom du jeu, la date et le nombre de joueurs.");
      return;
    }

    const { data: session, error } = await client.from("sessions").insert({
      creator_id: currentUser.id,
      game_name: gameName,
      session_date: sessionDate,
      max_players: maxPlayers,
      description
    }).select().single();

    if (error) {
      showToast("Création impossible : " + error.message);
      return;
    }

    const { error: registrationError } = await client.from("registrations").insert({
      session_id: session.id, user_id: currentUser.id
    });
    showToast(registrationError
      ? "Partie créée, mais ton inscription est à vérifier : " + registrationError.message
      : "Partie créée ! Tu es inscrit automatiquement 🎉");
    $("session-form").reset();
    $("max-players").value = "4";
    $("session-date").min = today();
    await loadSessions();
  });

  $("avatar-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("La photo doit faire 2 Mo maximum.");
      event.target.value = "";
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showToast("Format accepté : JPG, PNG ou WEBP.");
      event.target.value = "";
      return;
    }
    if (!window.AVATAR_BUCKET) {
      showToast("Le nom du stockage photo est absent de config.js.");
      return;
    }

    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = currentUser.id + "/avatar." + extension;
    const { error: uploadError } = await client.storage.from(window.AVATAR_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      showToast("Envoi impossible : " + uploadError.message);
      return;
    }
    const { data } = client.storage.from(window.AVATAR_BUCKET).getPublicUrl(path);
    const publicUrl = data.publicUrl + "?v=" + Date.now();
    const { error } = await client.from("profiles")
      .update({ avatar_url: publicUrl }).eq("id", currentUser.id);
    if (error) {
      showToast(error.message);
      return;
    }
    showToast("Photo de profil mise à jour !");
    await loadProfile();
    event.target.value = "";
  });

  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.authTab));
  });
  $("logout-btn").addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (error) showToast(error.message);
    currentUser = null;
    currentProfile = null;
    await refreshAuth();
  });
  $("refresh-btn").addEventListener("click", loadSessions);

  $("session-date").min = today();
  setMode("login");
  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    // Laisse Supabase terminer son traitement avant de relire la session.
    setTimeout(() => refreshAuth(), 0);
  });
  refreshAuth();
})();
