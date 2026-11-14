(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  let client = null;
  let authMode = "login";
  let currentUser = null;
  let currentProfile = null;
  let siteControl = { maintenance_enabled: false, maintenance_message: "", registrations_enabled: true };
  let superAdminUIReady = false;

  const toast = (message) => {
    const el = $("toast");
    if (!el) {
      console.error(message);
      return;
    }
    el.textContent = String(message);
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 4500);
  };

  const escapeHtml = (s = "") => String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const dateText = (d) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  function setMode(mode) {
    authMode = mode;
    document.querySelectorAll("[data-auth-tab]").forEach(b =>
      b.classList.toggle("active", b.dataset.authTab === mode)
    );
    $("name-fields")?.classList.toggle("hidden", mode !== "signup");
    const signupUsername = $("username");
    if (signupUsername) signupUsername.required = mode === "signup";
    const signupTab = document.querySelector('[data-auth-tab="signup"]');
    if (signupTab) {
      signupTab.classList.toggle("hidden", !siteControl.registrations_enabled);
      signupTab.disabled = !siteControl.registrations_enabled;
    }
    const submit = $("auth-submit");
    if (submit) {
      submit.innerHTML = mode === "signup"
        ? 'Créer mon compte <span>→</span>'
        : 'Se connecter <span>→</span>';
    }
    const password = $("password");
    if (password) password.autocomplete = mode === "signup" ? "new-password" : "current-password";
  }

  function friendlyAuthError(error) {
    const message = error?.message || "Une erreur inconnue est survenue.";
    if (/invalid login credentials/i.test(message)) return "Adresse e-mail ou mot de passe incorrect.";
    if (/email not confirmed/i.test(message)) return "Ton adresse e-mail n'est pas encore confirmée. Vérifie ta boîte mail.";
    if (/user already registered/i.test(message)) return "Un compte existe déjà avec cette adresse e-mail.";
    if (/profiles_username_unique|duplicate key value.*username|unique constraint/i.test(message)) return "Ce pseudo est déjà utilisé. Choisis-en un autre.";
    if (/password should be at least/i.test(message)) return "Le mot de passe doit contenir au moins 8 caractères.";
    if (/rate limit|too many requests/i.test(message)) return "Trop de tentatives. Attends un peu avant de réessayer.";
    if (/passkey_disabled/i.test(message)) return "La connexion par clé d’accès n’est pas encore activée dans les réglages Supabase.";
    if (/not supported|webauthn|passkey/i.test(message)) return "Cette clé d’accès n’a pas pu être utilisée. Vérifie que ton appareil et ton navigateur la prennent en charge.";
    return message;
  }

  async function refreshAuth() {
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      currentUser = data?.session?.user || null;

      $("auth-section")?.classList.toggle("hidden", !!currentUser);
      $("app-section")?.classList.toggle("hidden", !currentUser);
      $("logout-btn")?.classList.toggle("hidden", !currentUser);
      if ($("user-label")) $("user-label").textContent = currentUser?.email || "";

      if (currentUser) {
        await loadApp();
      } else {
        currentProfile = null;
      }
    } catch (error) {
      console.error("Erreur de vérification de session :", error);
      toast("Impossible de vérifier la connexion : " + friendlyAuthError(error));
    }
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();

    const email = $("email")?.value.trim();
    const password = $("password")?.value;
    const submit = $("auth-submit");

    if (!email || !password) {
      toast("Renseigne ton adresse e-mail et ton mot de passe.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast("Renseigne une adresse e-mail valide.");
      return;
    }

    if (authMode === "signup") {
      const username = $("username")?.value.trim() || "";
      const firstName = $("first-name")?.value.trim() || "";
      const lastName = $("last-name")?.value.trim() || "";
      if (!username) {
        toast("Choisis un pseudo.");
        return;
      }
      if (!firstName || !lastName) {
        toast("Renseigne ton prénom et ton nom.");
        return;
      }
    }

    if (submit) {
      submit.disabled = true;
      submit.dataset.originalText ||= submit.innerHTML;
      submit.textContent = authMode === "signup" ? "Création du compte…" : "Connexion…";
    }

    try {
      let result;

      if (authMode === "signup") {
        result = await client.auth.signUp({
          email,
          password,
          options: {
            // Après confirmation, revenir sur le site publié (GitHub Pages).
            emailRedirectTo: window.location.origin + window.location.pathname,
            data: {
              username: $("username").value.trim(),
              first_name: $("first-name").value.trim(),
              last_name: $("last-name").value.trim()
            }
          }
        });

        if (result.error) throw result.error;

        if (!result.data?.session) {
          toast("Compte créé ! Vérifie ta boîte mail pour confirmer ton inscription.");
          return;
        }
      } else {
        result = await client.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
      }

      toast(authMode === "signup" ? "Compte créé et connexion réussie !" : "Connexion réussie !");
      await refreshAuth();
    } catch (error) {
      console.error("Erreur de connexion/inscription :", error);
      toast(friendlyAuthError(error));
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.innerHTML = submit.dataset.originalText || (
          authMode === "signup" ? 'Créer mon compte <span>→</span>' : 'Se connecter <span>→</span>'
        );
        delete submit.dataset.originalText;
      }
    }
  }

  async function loadProfile() {
    const { data, error } = await client.from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error) {
      toast("Erreur profil : " + error.message);
      return null;
    }

    currentProfile = data;
    $("welcome-title").textContent = "Bonjour" + (data?.first_name ? " " + data.first_name : "") + " !";
    $("profile-username").value = data?.username || "";
    $("profile-first").value = data?.first_name || "";
    $("profile-last").value = data?.last_name || "";
    if ($("user-label")) {
      $("user-label").textContent = [data?.username, data?.first_name].filter(Boolean).join(" · ") || currentUser.email || "";
    }

    $("avatar-preview").src = data?.avatar_url ||
      "data:image/svg+xml," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" rx="18" fill="#eee8ff"/><text x="50%" y="58%" text-anchor="middle" font-size="38">👤</text></svg>'
      );

    const staff = ["admin", "super_admin"].includes(data?.role);
    $("admin-section").classList.toggle("hidden", !staff);
    const isSuper = data?.role === "super_admin";
    $("super-admin-nav")?.classList.toggle("hidden", !isSuper);
    $("super-admin-section")?.classList.toggle("hidden", !isSuper);
    return data;
  }

  async function loadApp() {
    await loadProfile();
    await loadPasskeys();
    await loadSessions();
    await loadHistory();
    if (siteControl.maintenance_enabled && currentProfile?.role !== "super_admin") {
      $("app-section")?.classList.add("hidden");
      $("auth-section")?.classList.remove("hidden");
      $("auth-form")?.classList.add("hidden");
      $("site-notice")?.classList.remove("hidden");
      return;
    } else {
      $("auth-form")?.classList.remove("hidden");
    }
    await loadSuperAdmin();
    if (["admin", "super_admin"].includes(currentProfile?.role)) {
      await loadMembers();
    }
  }

  async function handleProfileSubmit(e) {
    e.preventDefault();
    try {
      const username = $("profile-username").value.trim();
      if (!username) {
        toast("Renseigne ton pseudo.");
        return;
      }
      const { error } = await client.from("profiles").update({
        username,
        first_name: $("profile-first").value.trim(),
        last_name: $("profile-last").value.trim()
      }).eq("id", currentUser.id);

      if (error) throw error;
      toast("Profil enregistré !");
      await loadProfile();
    } catch (error) {
      toast("Enregistrement impossible : " + error.message);
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast("La photo doit faire 2 Mo maximum.");
      e.target.value = "";
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast("Format accepté : JPG, PNG ou WEBP.");
      e.target.value = "";
      return;
    }

    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = currentUser.id + "/avatar." + ext;
      const { error: uploadError } = await client.storage.from(window.AVATAR_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data } = client.storage.from(window.AVATAR_BUCKET).getPublicUrl(path);
      const url = data.publicUrl + "?v=" + Date.now();
      const { error } = await client.from("profiles")
        .update({ avatar_url: url }).eq("id", currentUser.id);

      if (error) throw error;
      toast("Photo de profil mise à jour !");
      await loadProfile();
    } catch (error) {
      toast("Envoi impossible : " + error.message);
    }
  }

  async function handleSessionSubmit(e) {
    e.preventDefault();
    const game_name = $("game-name").value.trim();
    const session_date = $("session-date").value;
    const max_players = Number($("max-players").value);
    const description = $("description").value.trim() || null;

    if (!session_date || session_date < new Date().toISOString().slice(0, 10)) {
      toast("Choisis une date à partir d'aujourd'hui.");
      return;
    }

    try {
      const { data: session, error } = await client.from("sessions")
        .insert({ creator_id: currentUser.id, game_name, session_date, max_players, description })
        .select().single();

      if (error) throw error;

      const { error: regError } = await client.from("registrations")
        .insert({ session_id: session.id, user_id: currentUser.id });

      if (regError) {
        toast("Partie créée, mais inscription du créateur à vérifier : " + regError.message);
      } else {
        toast("Partie créée ! Tu es inscrit automatiquement 🎉");
      }

      $("session-form").reset();
      $("max-players").value = 4;
      await loadSessions();
    } catch (error) {
      toast("Création impossible : " + error.message);
    }
  }

  async function loadSessions() {
    const box = $("sessions-list");
    box.innerHTML = '<div class="empty-state">Chargement…</div>';

    try {
      const { data: sessions, error } = await client.from("sessions").select("*")
        .gte("session_date", new Date().toISOString().slice(0, 10))
        .order("session_date", { ascending: true });

      if (error) throw error;

      if (!sessions?.length) {
        box.innerHTML = '<div class="empty-state">🎲 Aucune partie prévue pour le moment. Pourquoi ne pas en créer une ?</div>';
        return;
      }

      const ids = sessions.map(s => s.id);
      const { data: regs, error: regsError } = await client.from("registrations")
        .select("session_id,user_id").in("session_id", ids);
      if (regsError) throw regsError;

      const userIds = [...new Set((regs || []).map(r => r.user_id))];
      const { data: profiles, error: profilesError } = userIds.length
        ? await client.from("profiles").select("id,username,first_name,last_name").in("id", userIds)
        : { data: [] };
      if (profilesError) throw profilesError;

      const pmap = Object.fromEntries((profiles || []).map(p => [
        p.id, [p.username, p.first_name].filter(Boolean).join(" · ") || ((p.first_name || "") + " " + (p.last_name || "")).trim() || "Membre"
      ]));

      box.innerHTML = sessions.map(s => {
        const rs = (regs || []).filter(r => r.session_id === s.id);
        const full = rs.length >= s.max_players;
        const joined = rs.some(r => r.user_id === currentUser.id);
        const owner = s.creator_id === currentUser.id;
        const staff = ["admin", "super_admin"].includes(currentProfile?.role);
        const names = rs.map(r => escapeHtml(pmap[r.user_id] || "Membre")).join(", ");
        const action = joined
          ? `<button class="btn btn-light" data-unjoin="${escapeHtml(s.id)}">Me désinscrire</button>`
          : full ? '<button class="btn btn-light" disabled>Complet</button>'
          : `<button class="btn btn-primary" data-join="${escapeHtml(s.id)}">Je m'inscris !</button>`;
        const manage = (owner || staff)
          ? `<button class="btn btn-light" data-edit="${escapeHtml(s.id)}">Modifier</button><button class="btn btn-light" data-delete="${escapeHtml(s.id)}">Supprimer</button>`
          : "";

        const remaining = Math.max(0, Number(s.max_players) - rs.length);
        const remainingLabel = remaining === 1 ? "place restante" : "places restantes";
        return `<article class="session-card"><h3>🎲 ${escapeHtml(s.game_name)}</h3><div class="session-meta"><span class="pill">📅 ${escapeHtml(dateText(s.session_date))}</span><span class="pill">👥 ${rs.length}/${escapeHtml(s.max_players)} joueurs</span><span class="pill">🪑 ${remaining} ${remainingLabel}</span></div>${s.description ? `<p class="session-desc">${escapeHtml(s.description)}</p>` : ""}<div class="participants">Participants : ${names || "Pas encore de joueur"}</div><div class="card-actions">${action}${manage}</div></article>`;
      }).join("");

      box.querySelectorAll("[data-join]").forEach(b => b.onclick = () => register(b.dataset.join));
      box.querySelectorAll("[data-unjoin]").forEach(b => b.onclick = () => unregister(b.dataset.unjoin));
      box.querySelectorAll("[data-delete]").forEach(b => b.onclick = () => deleteSession(b.dataset.delete));
      box.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => editSession(sessions.find(s => s.id === b.dataset.edit)));
    } catch (error) {
      console.error("Erreur de chargement des parties :", error);
      box.innerHTML = '<div class="empty-state">Impossible de charger les parties : ' + escapeHtml(error.message) + '</div>';
    }
  }

  async function loadHistory() {
    const box = $("history-list");
    if (!box) return;
    box.innerHTML = '<div class="empty-state">Chargement de l’historique…</div>';

    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: sessions, error } = await client.from("sessions").select("*")
        .lt("session_date", today)
        .order("session_date", { ascending: false });
      if (error) throw error;

      if (!sessions?.length) {
        box.innerHTML = '<div class="empty-state">Aucune partie passée pour le moment.</div>';
        return;
      }

      const ids = sessions.map(s => s.id);
      const { data: regs, error: regsError } = await client.from("registrations")
        .select("session_id,user_id").in("session_id", ids);
      if (regsError) throw regsError;

      const userIds = [...new Set((regs || []).map(r => r.user_id))];
      const { data: profiles, error: profilesError } = userIds.length
        ? await client.from("profiles").select("id,username,first_name,last_name").in("id", userIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;

      const pmap = Object.fromEntries((profiles || []).map(p => [
        p.id, [p.username, p.first_name].filter(Boolean).join(" · ") ||
          ((p.first_name || "") + " " + (p.last_name || "")).trim() || "Membre"
      ]));

      box.innerHTML = sessions.map(s => {
        const rs = (regs || []).filter(r => r.session_id === s.id);
        const names = rs.map(r => escapeHtml(pmap[r.user_id] || "Membre")).join(", ");
        return `<article class="session-card"><h3>🎲 ${escapeHtml(s.game_name)}</h3><div class="session-meta"><span class="pill">📅 ${escapeHtml(dateText(s.session_date))}</span><span class="pill">👥 ${rs.length}/${escapeHtml(s.max_players)} joueurs</span></div>${s.description ? `<p class="session-desc">${escapeHtml(s.description)}</p>` : ""}<div class="participants">Participants : ${names || "Aucun participant enregistré"}</div></article>`;
      }).join("");
    } catch (error) {
      console.error("Erreur de chargement de l’historique :", error);
      box.innerHTML = '<div class="empty-state">Impossible de charger l’historique : ' + escapeHtml(error.message) + '</div>';
    }
  }

  async function register(id) {
    try {
      const { error } = await client.from("registrations").insert({ session_id: id, user_id: currentUser.id });
      if (error) throw error;
      toast("Inscription confirmée ! 🎉");
    } catch (error) {
      toast(error.message?.includes("duplicate") ? "Tu es déjà inscrit." : error.message);
    }
    await loadSessions();
  }

  async function unregister(id) {
    try {
      const { error } = await client.from("registrations").delete()
        .eq("session_id", id).eq("user_id", currentUser.id);
      if (error) throw error;
      toast("Désinscription effectuée.");
    } catch (error) {
      toast(error.message);
    }
    await loadSessions();
  }

  async function deleteSession(id) {
    if (!confirm("Supprimer définitivement cette partie ?")) return;
    try {
      const { error } = await client.from("sessions").delete().eq("id", id);
      if (error) throw error;
      toast("Partie supprimée.");
    } catch (error) {
      toast(error.message);
    }
    await loadSessions();
  }

  async function editSession(s) {
    if (!s) return;
    const game = prompt("Nom du jeu :", s.game_name);
    if (game === null) return;
    const date = prompt("Date (AAAA-MM-JJ) :", s.session_date);
    if (date === null) return;
    const max = prompt("Nombre maximum de joueurs :", s.max_players);
    if (max === null) return;
    const desc = prompt("Description (facultative) :", s.description || "");
    if (desc === null) return;

    const maxPlayers = Number(max);
    if (!game.trim() || !date || !Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 100) {
      toast("Vérifie le nom, la date et le nombre de joueurs.");
      return;
    }

    try {
      const { error } = await client.from("sessions").update({
        game_name: game.trim(), session_date: date, max_players: maxPlayers, description: desc.trim() || null
      }).eq("id", s.id);
      if (error) throw error;
      toast("Partie modifiée.");
    } catch (error) {
      toast(error.message);
    }
    await loadSessions();
  }

  async function loadMembers() {
    const box = $("admin-members");
    box.innerHTML = '<div class="empty-state">Chargement des membres…</div>';
    try {
      const { data, error } = await client.functions.invoke("admin-members");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const members = data?.members || [];

      if (!members.length) {
        box.textContent = "Aucun membre.";
        return;
      }

      const isSuper = currentProfile?.role === "super_admin";
      box.innerHTML = members.map(m => `
        <div class="admin-member">
          <div>
            <strong>${escapeHtml(((m.first_name || "") + " " + (m.last_name || "")).trim() || "Membre")}</strong>
            <small>✉️ ${escapeHtml(m.email || "Adresse e-mail indisponible")}</small>
            <small>${escapeHtml(m.role)} • ${escapeHtml(m.id.slice(0, 8))}…</small>
          </div>
          ${isSuper && m.id !== currentUser.id
            ? `<select data-role="${escapeHtml(m.id)}" aria-label="Rôle du membre">
                <option value="member" ${m.role === "member" ? "selected" : ""}>Membre</option>
                <option value="admin" ${m.role === "admin" ? "selected" : ""}>Administrateur</option>
                <option value="super_admin" ${m.role === "super_admin" ? "selected" : ""}>Super-administrateur</option>
              </select>`
            : `<span class="admin-tag">${m.role === "super_admin" ? "Super admin" : m.role === "admin" ? "Admin" : "Membre"}</span>`}
        </div>`).join("");

      box.querySelectorAll("[data-role]").forEach(sel => sel.onchange = async () => {
        sel.disabled = true;
        try {
          const { data, error } = await client.functions.invoke("set-member-role", {
            body: { user_id: sel.dataset.role, role: sel.value }
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          toast("Rôle mis à jour.");
          await loadMembers();
        } catch (error) {
          toast(error.message || "Modification du rôle impossible.");
          await loadMembers();
        }
      });
    } catch (error) {
      console.error("Erreur de chargement des membres :", error);
      box.textContent = "Impossible de charger les membres : " + (error.message || "Erreur inconnue");
    }
  }


  let siteControl = { maintenance_enabled: false, maintenance_message: "", registrations_enabled: true };
  let superAdminUIReady = false;

  async function loadPublicSiteControl() {
    try {
      const { data, error } = await client.from("site_control")
        .select("maintenance_enabled,maintenance_message,registrations_enabled").eq("id", 1).maybeSingle();
      if (error) throw error;
      if (data) siteControl = data;
    } catch (error) {
      console.warn("État public du site indisponible :", error);
    }
    applySiteControls();
  }

  function applySiteControls() {
    const notice = $("site-notice");
    const signupTab = document.querySelector('[data-auth-tab="signup"]');
    const signupMode = authMode === "signup";
    if (signupTab) {
      signupTab.classList.toggle("hidden", !siteControl.registrations_enabled);
      signupTab.disabled = !siteControl.registrations_enabled;
    }
    if (signupMode && !siteControl.registrations_enabled) setMode("login");
    if (notice) {
      const maintenance = siteControl.maintenance_enabled;
      notice.classList.toggle("hidden", !maintenance);
      notice.textContent = maintenance ? (siteControl.maintenance_message || "Le site est temporairement en maintenance.") : "";
    }
  }

  async function superAdminRequest(action, payload = {}) {
    const { data, error } = await client.functions.invoke("super-admin-portal", { body: { action, ...payload } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  function setupSuperAdminUI() {
    const content = $("super-admin-content");
    if (!content || superAdminUIReady) return;
    superAdminUIReady = true;
    content.innerHTML =
      '<div class="panel-heading"><div><span class="eyebrow">ACCÈS PRIVILÉGIÉ</span><h2>Centre Super-Administrateur</h2></div><span class="emoji">👑</span></div>' +
      '<p class="hint">Espace confidentiel : les réglages et actions sont vérifiés côté serveur.</p>' +
      '<div class="sa-toolbar"><button id="sa-refresh" class="btn btn-light" type="button">↻ Actualiser les données</button><span id="sa-status" class="hint"></span></div>' +
      '<section class="sa-block"><h3>📊 Tableau de bord statistique</h3><div id="sa-stats" class="sa-stats"><div class="empty-state">Chargement des statistiques…</div></div></section>' +
      '<section class="sa-block"><h3>⚙️ Mode maintenance et contrôle du site</h3><div class="sa-controls">' +
      '<label class="sa-toggle"><input id="sa-maintenance" type="checkbox"> Activer le mode maintenance</label>' +
      '<label class="sa-toggle"><input id="sa-signups" type="checkbox"> Autoriser les nouvelles inscriptions</label>' +
      '</div><label>Message affiché pendant la maintenance<input id="sa-maintenance-message" maxlength="500" placeholder="Le site est temporairement en maintenance."></label>' +
      '<button id="sa-save-control" class="btn btn-primary" type="button">Enregistrer les réglages</button></section>' +
      '<section class="sa-block"><h3>👥 Gestion avancée des utilisateurs</h3><input id="sa-member-search" type="search" placeholder="Rechercher par pseudo, nom ou e-mail…"><div id="sa-members" class="sa-list">Chargement…</div></section>' +
      '<section class="sa-block"><h3>🛡️ Gestion avancée des administrateurs</h3><p class="hint">Promouvoir, rétrograder ou suspendre les comptes d’administration.</p><div id="sa-admins" class="sa-list">Chargement…</div></section>' +
      '<section class="sa-block"><h3>🎲 Gestion complète des parties</h3><div id="sa-sessions" class="sa-list">Chargement…</div></section>' +
      '<section class="sa-block"><h3>🔐 Journal de sécurité et des actions</h3><div id="sa-logs" class="sa-list">Chargement…</div></section>';

    $("super-admin-tab")?.addEventListener("click", () => {
      $("super-admin-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("sa-refresh")?.addEventListener("click", loadSuperAdminData);
    $("sa-save-control")?.addEventListener("click", saveSiteControl);
    $("sa-member-search")?.addEventListener("input", () => renderSuperAdminMembers(window.saMembers || []));
    content.addEventListener("change", async (event) => {
      const roleSelect = event.target.closest("[data-sa-role]");
      if (!roleSelect) return;
      roleSelect.disabled = true;
      try {
        await superAdminRequest("set_role", { user_id: roleSelect.dataset.saRole, role: roleSelect.value });
        toast("Rôle du compte mis à jour.");
        await loadSuperAdminData();
      } catch (error) {
        toast(error.message || "Modification du rôle impossible.");
        await loadSuperAdminData();
      }
    });
    content.addEventListener("click", async (event) => {
      const statusButton = event.target.closest("[data-sa-status]");
      const editButton = event.target.closest("[data-sa-edit-session]");
      const deleteButton = event.target.closest("[data-sa-delete-session]");
      if (statusButton) {
        const next = statusButton.dataset.status === "suspended" ? "active" : "suspended";
        const promptText = next === "suspended" ? "Suspendre ce compte ? Il ne pourra plus se connecter." : "Réactiver ce compte ?";
        if (!confirm(promptText)) return;
        statusButton.disabled = true;
        try {
          await superAdminRequest("set_status", { user_id: statusButton.dataset.saStatus, status: next });
          toast(next === "suspended" ? "Compte suspendu." : "Compte réactivé.");
          await loadSuperAdminData();
        } catch (error) {
          toast(error.message || "Action impossible.");
          await loadSuperAdminData();
        }
      }
      if (editButton) {
        const id = editButton.dataset.saEditSession;
        const session = (window.saSessions || []).find(item => item.id === id);
        if (!session) return;
        const game_name = prompt("Nom du jeu :", session.game_name);
        if (game_name === null) return;
        const session_date = prompt("Date (AAAA-MM-JJ) :", session.session_date);
        if (session_date === null) return;
        const max_players = Number(prompt("Nombre maximum de joueurs :", session.max_players));
        if (!Number.isInteger(max_players)) return;
        const description = prompt("Description :", session.description || "");
        if (description === null) return;
        try {
          await superAdminRequest("update_session", { id, game_name, session_date, max_players, description });
          toast("Partie mise à jour.");
          await loadSuperAdminData();
        } catch (error) { toast(error.message || "Modification impossible."); }
      }
      if (deleteButton) {
        const id = deleteButton.dataset.saDeleteSession;
        if (!confirm("Supprimer définitivement cette partie et ses inscriptions ?")) return;
        try {
          await superAdminRequest("delete_session", { id });
          toast("Partie supprimée.");
          await loadSuperAdminData();
          await loadSessions();
          await loadHistory();
        } catch (error) { toast(error.message || "Suppression impossible."); }
      }
    });
  }

  function renderSuperAdminMembers(members) {
    const box = $("sa-members");
    if (!box) return;
    const search = ($("sa-member-search")?.value || "").trim().toLowerCase();
    const filtered = members.filter(m => [m.username, m.first_name, m.last_name, m.email, m.role].join(" ").toLowerCase().includes(search));
    if (!filtered.length) { box.innerHTML = '<div class="empty-state">Aucun compte correspondant.</div>'; return; }
    box.innerHTML = filtered.map(m => {
      const label = [m.username, [m.first_name, m.last_name].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "Membre";
      const role = ["member","admin","super_admin"].includes(m.role) ? m.role : "member";
      const status = m.account_status || "active";
      return '<div class="sa-row"><div class="sa-row-main"><strong>' + escapeHtml(label) + '</strong><small>✉️ ' + escapeHtml(m.email || "E-mail indisponible") + '</small><small>' + escapeHtml(role) + ' · ' + escapeHtml(status) + '</small></div>' +
        (m.id === currentUser.id ? '<span class="admin-tag">Votre compte</span>' :
        '<div class="sa-row-actions"><select data-sa-role="' + escapeHtml(m.id) + '" aria-label="Rôle de ' + escapeHtml(label) + '">' +
        '<option value="member" ' + (role === "member" ? "selected" : "") + '>Membre</option>' +
        '<option value="admin" ' + (role === "admin" ? "selected" : "") + '>Administrateur</option>' +
        '<option value="super_admin" ' + (role === "super_admin" ? "selected" : "") + '>Super-administrateur</option></select>' +
        '<button class="btn btn-light" type="button" data-sa-status="' + escapeHtml(m.id) + '" data-status="' + escapeHtml(status) + '">' + (status === "suspended" ? "Réactiver" : "Suspendre") + '</button></div>') +
        '</div>';
    }).join("");
  }

  async function saveSiteControl() {
    const button = $("sa-save-control");
    button.disabled = true;
    try {
      const maintenance_enabled = $("sa-maintenance").checked;
      const registrations_enabled = $("sa-signups").checked;
      const maintenance_message = $("sa-maintenance-message").value.trim();
      await superAdminRequest("update_site_control", { maintenance_enabled, registrations_enabled, maintenance_message });
      siteControl = { maintenance_enabled, registrations_enabled, maintenance_message };
      applySiteControls();
      toast("Réglages du site enregistrés.");
    } catch (error) {
      toast(error.message || "Enregistrement impossible.");
    } finally { button.disabled = false; }
  }

  async function loadSuperAdminData() {
    if (currentProfile?.role !== "super_admin") return;
    const status = $("sa-status");
    if (status) status.textContent = "Mise à jour…";
    try {
      const [dashboard, memberData, adminData, sessionData, logData, control] = await Promise.all([
        superAdminRequest("dashboard"),
        superAdminRequest("list_members"),
        superAdminRequest("list_admins"),
        superAdminRequest("list_sessions"),
        superAdminRequest("list_logs"),
        client.from("site_control").select("maintenance_enabled,maintenance_message,registrations_enabled").eq("id", 1).maybeSingle()
      ]);
      if (control.error) throw control.error;
      siteControl = control.data || siteControl;
      const stats = dashboard.stats || {};
      const statItems = [
        ["Membres", stats.members || 0], ["Administrateurs", stats.admins || 0],
        ["Parties", stats.sessions || 0], ["À venir", stats.upcoming || 0],
        ["Inscriptions aux parties", stats.registrations || 0]
      ];
      $("sa-stats").innerHTML = statItems.map(item => '<div class="sa-stat"><strong>' + Number(item[1]).toLocaleString("fr-FR") + '</strong><span>' + item[0] + '</span></div>').join("");
      $("sa-maintenance").checked = !!siteControl.maintenance_enabled;
      $("sa-signups").checked = !!siteControl.registrations_enabled;
      $("sa-maintenance-message").value = siteControl.maintenance_message || "";
      window.saMembers = memberData.members || [];
      window.saSessions = sessionData.sessions || [];
      renderSuperAdminMembers(window.saMembers);
      $("sa-admins").innerHTML = (adminData.members || []).length ? adminData.members.map(m =>
        '<div class="sa-row"><div class="sa-row-main"><strong>' + escapeHtml([m.username, m.first_name, m.last_name].filter(Boolean).join(" · ") || "Administrateur") + '</strong><small>' + escapeHtml(m.email || "") + '</small><small>' + escapeHtml(m.role) + ' · ' + escapeHtml(m.account_status || "active") + '</small></div></div>'
      ).join("") : '<div class="empty-state">Aucun administrateur supplémentaire.</div>';
      $("sa-sessions").innerHTML = window.saSessions.length ? window.saSessions.map(s =>
        '<div class="sa-row"><div class="sa-row-main"><strong>🎲 ' + escapeHtml(s.game_name) + '</strong><small>📅 ' + escapeHtml(dateText(s.session_date)) + ' · ' + Number(s.participant_count || 0) + '/' + Number(s.max_players) + ' joueurs</small></div><div class="sa-row-actions"><button class="btn btn-light" type="button" data-sa-edit-session="' + escapeHtml(s.id) + '">Modifier</button><button class="btn btn-light" type="button" data-sa-delete-session="' + escapeHtml(s.id) + '">Supprimer</button></div></div>'
      ).join("") : '<div class="empty-state">Aucune partie enregistrée.</div>';
      $("sa-logs").innerHTML = (logData.logs || []).length ? logData.logs.map(log =>
        '<div class="sa-log"><strong>' + escapeHtml(log.action) + '</strong><small>' + escapeHtml(log.actor_email || "Compte inconnu") + ' · ' + escapeHtml(new Date(log.created_at).toLocaleString("fr-FR")) + '</small><small>' + escapeHtml(log.target_label || "") + '</small></div>'
      ).join("") : '<div class="empty-state">Aucune action enregistrée pour le moment.</div>';
      if (status) status.textContent = "Données actualisées.";
    } catch (error) {
      console.error("Centre Super-Administrateur :", error);
      if (status) status.textContent = "Erreur de chargement : " + (error.message || "inconnue");
      toast("Impossible de charger le centre Super-Administrateur.");
    }
  }

  async function loadSuperAdmin() {
    const allowed = currentProfile?.role === "super_admin";
    $("super-admin-nav")?.classList.toggle("hidden", !allowed);
    $("super-admin-section")?.classList.toggle("hidden", !allowed);
    if (!allowed) {
      $("super-admin-content").innerHTML = "";
      superAdminUIReady = false;
      return;
    }
    setupSuperAdminUI();
    await loadSuperAdminData();
  }


  async function signInWithPasskey() {
    const button = $("passkey-login-btn");
    if (button) { button.disabled = true; button.textContent = "Connexion en cours…"; }
    try {
      if (!client?.auth?.signInWithPasskey) throw new Error("La bibliothèque Supabase ne prend pas en charge les clés d’accès.");
      const { error } = await client.auth.signInWithPasskey();
      if (error) throw error;
      toast("Connexion avec la clé d’accès réussie !");
      await refreshAuth();
    } catch (error) {
      console.error("Connexion par clé d’accès impossible :", error);
      toast(friendlyAuthError(error));
    } finally {
      if (button) { button.disabled = false; button.textContent = "Se connecter avec une clé d’accès 🔐"; }
    }
  }

  async function registerPasskey() {
    const button = $("passkey-register-btn");
    if (button) { button.disabled = true; button.textContent = "Enregistrement…"; }
    try {
      if (!client?.auth?.registerPasskey) throw new Error("La bibliothèque Supabase ne prend pas en charge les clés d’accès.");
      const { error } = await client.auth.registerPasskey();
      if (error) throw error;
      toast("Clé d’accès ajoutée à ton compte !");
      await loadPasskeys();
    } catch (error) {
      console.error("Ajout de clé d’accès impossible :", error);
      toast(friendlyAuthError(error));
    } finally {
      if (button) { button.disabled = false; button.textContent = "Ajouter une clé d’accès 🔐"; }
    }
  }

  async function loadPasskeys() {
    const box = $("passkey-list");
    if (!box || !currentUser) return;
    if (!client?.auth?.passkey?.list) {
      box.textContent = "La gestion des clés d’accès n’est pas disponible dans cette version.";
      return;
    }
    try {
      const { data, error } = await client.auth.passkey.list();
      if (error) throw error;
      const items = Array.isArray(data) ? data : (data?.passkeys || []);
      if (!items.length) {
        box.textContent = "Aucune clé d’accès enregistrée pour le moment.";
        return;
      }
      box.innerHTML = items.map(item => `
        <div class="passkey-item">
          <span>🔑 ${escapeHtml(item.friendly_name || "Clé d’accès")}<small>Ajoutée le ${escapeHtml(new Date(item.created_at).toLocaleDateString("fr-FR"))}</small></span>
          <button class="btn btn-light" type="button" data-remove-passkey="${escapeHtml(item.id)}">Retirer</button>
        </div>`).join("");
      box.querySelectorAll("[data-remove-passkey]").forEach(button => {
        button.addEventListener("click", async () => {
          if (!confirm("Retirer cette clé d’accès de ton compte ?")) return;
          button.disabled = true;
          try {
            const { error } = await client.auth.passkey.delete({ passkeyId: button.dataset.removePasskey });
            if (error) throw error;
            toast("Clé d’accès retirée.");
            await loadPasskeys();
          } catch (error) {
            toast(friendlyAuthError(error));
            button.disabled = false;
          }
        });
      });
    } catch (error) {
      console.error("Chargement des clés d’accès impossible :", error);
      box.textContent = friendlyAuthError(error);
    }
  }

  function setupPasskeyUI() {
    const submit = $("auth-submit");
    if (submit && !$("passkey-login-btn")) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = "passkey-login-btn";
      button.className = "btn btn-light full passkey-login";
      button.textContent = "Se connecter avec une clé d’accès 🔐";
      button.addEventListener("click", signInWithPasskey);
      submit.insertAdjacentElement("afterend", button);
    }
    const panel = document.querySelector(".profile-panel");
    if (panel && !$("passkey-settings")) {
      const section = document.createElement("section");
      section.id = "passkey-settings";
      section.className = "passkey-settings";
      section.innerHTML = '<h3>Clés d’accès 🔐</h3><p class="hint">Ajoute une clé pour te connecter avec le verrouillage de ton appareil, sans saisir ton mot de passe.</p><button id="passkey-register-btn" class="btn btn-light full" type="button">Ajouter une clé d’accès 🔐</button><div id="passkey-list" class="passkey-list" aria-live="polite"></div>';
      panel.appendChild(section);
      $("passkey-register-btn").addEventListener("click", registerPasskey);
    }
  }

  function start() {
    // Le bouton œil fonctionne indépendamment de Supabase.
    const passwordToggle = $("password-toggle");
    passwordToggle?.addEventListener("click", (event) => {
      event.preventDefault();
      const field = $("password");
      if (!field) return;
      const showing = field.type === "password";
      field.type = showing ? "text" : "password";
      passwordToggle.textContent = showing ? "🙈" : "👁️";
      passwordToggle.setAttribute("aria-label", showing ? "Masquer le mot de passe" : "Afficher le mot de passe");
      passwordToggle.setAttribute("aria-pressed", String(showing));
      field.focus();
    });
    const requiredIds = ["toast", "auth-form", "auth-section", "app-section", "email", "password"];
    const missing = requiredIds.filter(id => !$(id));
    if (missing.length) {
      console.error("Éléments HTML manquants :", missing);
      return;
    }

    if (!window.supabase?.createClient) {
      toast("La bibliothèque Supabase n'a pas pu être chargée. Recharge la page et réessaie.");
      console.error("Supabase JS non disponible : vérifie le chargement du CDN.");
      return;
    }
    if (!window.SUPABASE_URL || !window.SUPABASE_PUBLISHABLE_KEY) {
      toast("La configuration Supabase est introuvable. Vérifie config.js.");
      console.error("Configuration Supabase manquante.");
      return;
    }

    try {
      client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);
      setupPasskeyUI();
      await loadPublicSiteControl();
    } catch (error) {
      console.error("Initialisation Supabase impossible :", error);
      toast("Impossible d'initialiser la connexion : " + error.message);
      return;
    }

    document.querySelectorAll("[data-auth-tab]").forEach(b =>
      b.addEventListener("click", () => setMode(b.dataset.authTab))
    );
    // Désactive la validation HTML native qui peut bloquer sans message
    // un formulaire contenant des champs obligatoires masqués.
    $("auth-form").noValidate = true;
    $("auth-form").addEventListener("submit", handleAuthSubmit);
    $("logout-btn")?.addEventListener("click", async () => {
      try {
        const { error } = await client.auth.signOut();
        if (error) throw error;
        currentUser = null;
        currentProfile = null;
        $("super-admin-nav")?.classList.add("hidden");
        $("super-admin-section")?.classList.add("hidden");
        await refreshAuth();
        toast("Déconnexion effectuée.");
      } catch (error) {
        toast("Déconnexion impossible : " + error.message);
      }
    });
    $("profile-form")?.addEventListener("submit", handleProfileSubmit);
    $("avatar-file")?.addEventListener("change", handleAvatarChange);
    $("session-form")?.addEventListener("submit", handleSessionSubmit);
    $("refresh-btn")?.addEventListener("click", loadSessions);
    if ($("session-date")) $("session-date").min = new Date().toISOString().slice(0, 10);

    client.auth.onAuthStateChange(() => {
      setTimeout(() => refreshAuth(), 0);
    });

    setMode("login");
    refreshAuth();
  }

  start();
})();
