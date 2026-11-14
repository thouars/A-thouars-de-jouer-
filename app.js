(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  let client = null;
  let authMode = "login";
  let currentUser = null;
  let currentProfile = null;

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
    return data;
  }

  async function loadApp() {
    await loadProfile();
    await loadPasskeys();
    await loadSessions();
    await loadHistory();
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
    try {
      const { data, error } = await client.from("profiles")
        .select("id,first_name,last_name,role,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      if (!data?.length) {
        box.textContent = "Aucun membre.";
        return;
      }

      const isSuper = currentProfile?.role === "super_admin";
      box.innerHTML = data.map(m => `
        <div class="admin-member">
          <div>${escapeHtml(((m.first_name || "") + " " + (m.last_name || "")).trim() || "Membre")}
            <small>${escapeHtml(m.role)} • ${escapeHtml(m.id.slice(0, 8))}…</small>
          </div>
          ${isSuper && m.id !== currentUser.id
            ? `<select data-role="${escapeHtml(m.id)}" aria-label="Rôle du membre">
                <option value="member" ${m.role === "member" ? "selected" : ""}>Membre</option>
                <option value="admin" ${m.role === "admin" ? "selected" : ""}>Administrateur</option>
              </select>`
            : `<span class="admin-tag">${m.role === "super_admin" ? "Super admin" : m.role === "admin" ? "Admin" : "Membre"}</span>`}
        </div>`).join("");

      box.querySelectorAll("[data-role]").forEach(sel => sel.onchange = async () => {
        try {
          const { error } = await client.from("profiles").update({ role: sel.value }).eq("id", sel.dataset.role);
          if (error) throw error;
          toast("Rôle mis à jour.");
          await loadMembers();
        } catch (error) {
          toast(error.message);
        }
      });
    } catch (error) {
      box.textContent = "Erreur : " + error.message;
    }
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
    $("password-toggle")?.addEventListener("click", () => {
      const field = $("password");
      const button = $("password-toggle");
      if (!field || !button) return;
      const showing = field.type === "password";
      field.type = showing ? "text" : "password";
      button.textContent = showing ? "🙈" : "👁️";
      button.setAttribute("aria-label", showing ? "Masquer le mot de passe" : "Afficher le mot de passe");
      button.setAttribute("aria-pressed", String(showing));
    });
    $("logout-btn")?.addEventListener("click", async () => {
      try {
        const { error } = await client.auth.signOut();
        if (error) throw error;
        currentUser = null;
        currentProfile = null;
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
