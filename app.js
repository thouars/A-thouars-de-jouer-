@@ -1,122 +1,496 @@

(() => {
  const $ = (id) => document.getElementById(id);
  const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);
  let authMode = "login", currentUser = null, currentProfile = null;
  const toast = (message) => { const el=$("toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3200); };
  const escapeHtml = (s="") => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const dateText = (d) => new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  function setMode(mode){authMode=mode;document.querySelectorAll("[data-auth-tab]").forEach(b=>b.classList.toggle("active",b.dataset.authTab===mode));$("name-fields").classList.toggle("hidden",mode!=="signup");$("auth-submit").innerHTML=mode==="signup"?'Créer mon compte <span>→</span>':'Se connecter <span>→</span>'; $("password").autocomplete=mode==="signup"?"new-password":"current-password";}
  document.querySelectorAll("[data-auth-tab]").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.authTab)));
  async function refreshAuth(){
    const {data:{session}}=await client.auth.getSession();
    currentUser=session?.user||null;
    $("auth-section").classList.toggle("hidden",!!currentUser);
    $("app-section").classList.toggle("hidden",!currentUser);
    $("logout-btn").classList.toggle("hidden",!currentUser);
    $("user-label").textContent=currentUser?.email||"";
    if(currentUser) await loadApp();

  const toast = (message) => {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3200);
  };

  const escapeHtml = (s = "") =>
    String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));

  const dateText = (d) =>
    new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    });

  function setMode(mode) {
    authMode = mode;
    document.querySelectorAll("[data-auth-tab]").forEach(b =>
      b.classList.toggle("active", b.dataset.authTab === mode)
    );

    $("name-fields").classList.toggle("hidden", mode !== "signup");

    const usernameInput = $("username");
    if (usernameInput) {
      usernameInput.disabled = mode !== "signup";
      usernameInput.required = mode === "signup";
      const usernameField = $("username-field");
      if (usernameField) usernameField.classList.toggle("hidden", mode !== "signup");
    }

    $("auth-submit").innerHTML = mode === "signup"
      ? 'Créer mon compte <span>→</span>'
      : 'Se connecter <span>→</span>';

    $("password").autocomplete = mode === "signup" ? "new-password" : "current-password";
  }
  $("auth-form").addEventListener("submit",async e=>{
    e.preventDefault(); const email=$("email").value.trim(),password=$("password").value;

  document.querySelectorAll("[data-auth-tab]").forEach(b =>
    b.addEventListener("click", () => setMode(b.dataset.authTab))
  );

  async function refreshAuth() {
    const { data: { session } } = await client.auth.getSession();
    currentUser = session?.user || null;

    $("auth-section").classList.toggle("hidden", !!currentUser);
    $("app-section").classList.toggle("hidden", !currentUser);
    $("logout-btn").classList.toggle("hidden", !currentUser);

    $("user-label").textContent = currentUser
      ? (currentProfile?.username ? "@" + currentProfile.username + " • " : "") +
        ((currentProfile?.first_name || "").trim() || "Mon compte")
      : "";

    if (currentUser) await loadApp();
  }

  $("auth-form").addEventListener("submit", async e => {
    e.preventDefault();

    const email = $("email").value.trim();
    const password = $("password").value;
    let result;
    if(authMode==="signup"){
      result=await client.auth.signUp({email,password,options:{data:{first_name:$("first-name").value.trim(),last_name:$("last-name").value.trim()}}});
      if(!result.error && !result.data.session){toast("Compte créé ! Vérifie ta boîte mail pour confirmer l'inscription.");return;}
    } else result=await client.auth.signInWithPassword({email,password});
    if(result.error){toast(result.error.message);return;} toast("Connexion réussie !"); await refreshAuth();

    if (authMode === "signup") {
      const username = $("username")?.value.trim() || "";

      if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
        toast("Le pseudo doit contenir 3 à 20 caractères : lettres, chiffres, _ ou -.");
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

      if (!result.error && !result.data.session) {
        toast("Compte créé ! Vérifie ta boîte mail pour confirmer l'inscription.");
        return;
      }
    } else {
      result = await client.auth.signInWithPassword({ email, password });
    }

    if (result.error) {
      toast(result.error.message);
      return;
    }

    toast("Connexion réussie !");
    await refreshAuth();
  });

  $("logout-btn").addEventListener("click", async () => {
    await client.auth.signOut();
    currentUser = null;
    currentProfile = null;
    await refreshAuth();
  });
  $("logout-btn").addEventListener("click",async()=>{await client.auth.signOut();currentUser=null;currentProfile=null;await refreshAuth();});
  async function loadProfile(){
    const {data,error}=await client.from("profiles").select("*").eq("id",currentUser.id).maybeSingle();
    if(error){toast("Erreur profil : "+error.message);return null;}
    currentProfile=data;
    $("welcome-title").textContent="Bonjour"+(data?.first_name?" "+data.first_name:"")+" !";
    $("profile-first").value=data?.first_name||"";$("profile-last").value=data?.last_name||"";
    $("avatar-preview").src=data?.avatar_url||"data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" rx="18" fill="#eee8ff"/><text x="50%" y="58%" text-anchor="middle" font-size="38">👤</text></svg>');
    const staff=["admin","super_admin"].includes(data?.role);
    $("admin-section").classList.toggle("hidden",!staff);

  async function loadProfile() {
    let { data, error } = await client
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error) {
      toast("Erreur profil : " + error.message);
      return null;
    }

    if (data && !data.username && currentUser.user_metadata?.username) {
      const { data: updated } = await client
        .from("profiles")
        .update({ username: currentUser.user_metadata.username })
        .eq("id", currentUser.id)
        .select()
        .maybeSingle();

      if (updated) data = updated;
    }

    currentProfile = data;

    $("user-label").textContent =
      (data?.username ? "@" + data.username + " • " : "") +
      ((data?.first_name || "").trim() || "Mon compte");

    $("welcome-title").textContent =
      "Bonjour" + (data?.first_name ? " " + data.first_name : "") + " !";

    $("profile-first").value = data?.first_name || "";
    $("profile-last").value = data?.last_name || "";

    if ($("profile-username")) {
      $("profile-username").value =
        data?.username || currentUser.user_metadata?.username || "";
    }

    $("avatar-preview").src = data?.avatar_url ||
      "data:image/svg+xml," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" rx="18" fill="#eee8ff"/><text x="50%" y="58%" text-anchor="middle" font-size="38">👤</text></svg>'
      );

    const staff = ["admin", "super_admin"].includes(data?.role);
    $("admin-section").classList.toggle("hidden", !staff);

    return data;
  }
  async function loadApp(){await loadProfile();await loadSessions();if(["admin","super_admin"].includes(currentProfile?.role))await loadMembers();}
  $("profile-form").addEventListener("submit",async e=>{
    e.preventDefault();const {error}=await client.from("profiles").update({first_name:$("profile-first").value.trim(),last_name:$("profile-last").value.trim()}).eq("id",currentUser.id);
    if(error)toast(error.message);else{toast("Profil enregistré !");await loadProfile();}

  async function loadApp() {
    await loadProfile();
    await loadSessions();

    if (["admin", "super_admin"].includes(currentProfile?.role)) {
      await loadMembers();
    }
  }

  $("profile-form").addEventListener("submit", async e => {
    e.preventDefault();

    const username = $("profile-username")?.value.trim() || "";

    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
      toast("Le pseudo doit contenir 3 à 20 caractères : lettres, chiffres, _ ou -.");
      return;
    }

    const { error } = await client.from("profiles").update({
      username,
      first_name: $("profile-first").value.trim(),
      last_name: $("profile-last").value.trim()
    }).eq("id", currentUser.id);

    if (error) {
      toast(error.code === "23505"
        ? "Ce pseudo est déjà utilisé. Choisis-en un autre."
        : error.message);
    } else {
      toast("Profil enregistré !");
      await loadProfile();
    }
  });
  $("avatar-file").addEventListener("change",async e=>{
    const file=e.target.files[0];if(!file)return;
    if(file.size>2*1024*1024){toast("La photo doit faire 2 Mo maximum.");e.target.value="";return;}
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){toast("Format accepté : JPG, PNG ou WEBP.");e.target.value="";return;}
    const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
    const path=currentUser.id+"/avatar."+ext;
    const {error:uploadError}=await client.storage.from(window.AVATAR_BUCKET).upload(path,file,{upsert:true,contentType:file.type});
    if(uploadError){toast("Envoi impossible : "+uploadError.message);return;}
    const {data}=client.storage.from(window.AVATAR_BUCKET).getPublicUrl(path);
    const url=data.publicUrl+"?v="+Date.now();
    const {error}=await client.from("profiles").update({avatar_url:url}).eq("id",currentUser.id);
    if(error){toast(error.message);return;}toast("Photo de profil mise à jour !");await loadProfile();

  $("avatar-file").addEventListener("change", async e => {
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

    const ext = file.type === "image/png" ? "png" :
      file.type === "image/webp" ? "webp" : "jpg";

    const path = currentUser.id + "/avatar." + ext;

    const { error: uploadError } = await client.storage
      .from(window.AVATAR_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      toast("Envoi impossible : " + uploadError.message);
      return;
    }

    const { data } = client.storage.from(window.AVATAR_BUCKET).getPublicUrl(path);
    const url = data.publicUrl + "?v=" + Date.now();

    const { error } = await client.from("profiles")
      .update({ avatar_url: url })
      .eq("id", currentUser.id);

    if (error) {
      toast(error.message);
      return;
    }

    toast("Photo de profil mise à jour !");
    await loadProfile();
  });
  $("session-form").addEventListener("submit",async e=>{
    e.preventDefault();const game_name=$("game-name").value.trim(),session_date=$("session-date").value,max_players=Number($("max-players").value),description=$("description").value.trim()||null;
    if(!session_date || session_date<new Date().toISOString().slice(0,10)){toast("Choisis une date à partir d'aujourd'hui.");return;}
    const {data:session,error}=await client.from("sessions").insert({creator_id:currentUser.id,game_name,session_date,max_players,description}).select().single();
    if(error){toast("Création impossible : "+error.message);return;}
    const {error:regError}=await client.from("registrations").insert({session_id:session.id,user_id:currentUser.id});
    if(regError){toast("Partie créée, mais inscription du créateur à vérifier : "+regError.message);}else toast("Partie créée ! Tu es inscrit automatiquement 🎉");
    $("session-form").reset();$("max-players").value=4;await loadSessions();

  $("session-form").addEventListener("submit", async e => {
    e.preventDefault();

    const game_name = $("game-name").value.trim();
    const session_date = $("session-date").value;
    const max_players = Number($("max-players").value);
    const description = $("description").value.trim() || null;

    if (!session_date || session_date < new Date().toISOString().slice(0, 10)) {
      toast("Choisis une date à partir d'aujourd'hui.");
      return;
    }

    const { data: session, error } = await client.from("sessions")
      .insert({
        creator_id: currentUser.id,
        game_name,
        session_date,
        max_players,
        description
      })
      .select()
      .single();

    if (error) {
      toast("Création impossible : " + error.message);
      return;
    }

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
  });
  async function loadSessions(){
    const box=$("sessions-list");box.innerHTML='<div class="empty-state">Chargement…</div>';
    const {data:sessions,error}=await client.from("sessions").select("*").gte("session_date",new Date().toISOString().slice(0,10)).order("session_date",{ascending:true});
    if(error){box.innerHTML='<div class="empty-state">Impossible de charger les parties : '+escapeHtml(error.message)+'</div>';return;}
    if(!sessions?.length){box.innerHTML='<div class="empty-state">🎲 Aucune partie prévue pour le moment. Pourquoi ne pas en créer une ?</div>';return;}
    const ids=sessions.map(s=>s.id);
    const {data:regs}=await client.from("registrations").select("session_id,user_id").in("session_id",ids);
    const userIds=[...new Set((regs||[]).map(r=>r.user_id))];
    const {data:profiles}=userIds.length?await client.from("profiles").select("id,first_name,last_name").in("id",userIds):{data:[]};
    const pmap=Object.fromEntries((profiles||[]).map(p=>[p.id,((p.first_name||"")+" "+(p.last_name||"")).trim()||"Membre"]));
    box.innerHTML=sessions.map(s=>{
      const rs=(regs||[]).filter(r=>r.session_id===s.id),full=rs.length>=s.max_players,joined=rs.some(r=>r.user_id===currentUser.id),owner=s.creator_id===currentUser.id,staff=["admin","super_admin"].includes(currentProfile?.role);
      const names=rs.map(r=>escapeHtml(pmap[r.user_id]||"Membre")).join(", ");
      let action=joined?`<button class="btn btn-light" data-unjoin="${s.id}">Me désinscrire</button>`:full?'<button class="btn btn-light" disabled>Complet</button>':`<button class="btn btn-primary" data-join="${s.id}">Je m'inscris !</button>`;
      let manage=(owner||staff)?`<button class="btn btn-light" data-edit="${s.id}">Modifier</button><button class="btn btn-light" data-delete="${s.id}">Supprimer</button>`:"";
      return `<article class="session-card"><h3>🎲 ${escapeHtml(s.game_name)}</h3><div class="session-meta"><span class="pill">📅 ${escapeHtml(dateText(s.session_date))}</span><span class="pill">👥 ${rs.length}/${s.max_players} joueurs</span></div>${s.description?`<p class="session-desc">${escapeHtml(s.description)}</p>`:""}<div class="participants">Participants : ${names||"Pas encore de joueur"}</div><div class="card-actions">${action}${manage}</div></article>`;

  async function loadSessions() {
    const box = $("sessions-list");
    box.innerHTML = '<div class="empty-state">Chargement…</div>';

    const { data: sessions, error } = await client.from("sessions")
      .select("*")
      .gte("session_date", new Date().toISOString().slice(0, 10))
      .order("session_date", { ascending: true });

    if (error) {
      box.innerHTML = '<div class="empty-state">Impossible de charger les parties : ' +
        escapeHtml(error.message) + '</div>';
      return;
    }

    if (!sessions?.length) {
      box.innerHTML = '<div class="empty-state">🎲 Aucune partie prévue pour le moment. Pourquoi ne pas en créer une ?</div>';
      return;
    }

    const ids = sessions.map(s => s.id);

    const { data: regs } = await client.from("registrations")
      .select("session_id,user_id")
      .in("session_id", ids);

    const userIds = [...new Set((regs || []).map(r => r.user_id))];

    const { data: profiles } = userIds.length
      ? await client.from("profiles")
          .select("id,username,first_name,last_name")
          .in("id", userIds)
      : { data: [] };

    const pmap = Object.fromEntries((profiles || []).map(p => [
      p.id,
      ((p.username ? "@" + p.username + " • " : "") + (p.first_name || "")).trim() || "Membre"
    ]));

    box.innerHTML = sessions.map(s => {
      const rs = (regs || []).filter(r => r.session_id === s.id);
      const full = rs.length >= s.max_players;
      const joined = rs.some(r => r.user_id === currentUser.id);
      const owner = s.creator_id === currentUser.id;
      const staff = ["admin", "super_admin"].includes(currentProfile?.role);

      const names = rs.map(r => escapeHtml(pmap[r.user_id] || "Membre")).join(", ");

      let action = joined
        ? `<button class="btn btn-light" data-unjoin="${s.id}">Me désinscrire</button>`
        : full
          ? '<button class="btn btn-light" disabled>Complet</button>'
          : `<button class="btn btn-primary" data-join="${s.id}">Je m'inscris !</button>`;

      let manage = (owner || staff)
        ? `<button class="btn btn-light" data-edit="${s.id}">Modifier</button><button class="btn btn-light" data-delete="${s.id}">Supprimer</button>`
        : "";

      return `<article class="session-card">
        <h3>🎲 ${escapeHtml(s.game_name)}</h3>
        <div class="session-meta">
          <span class="pill">📅 ${escapeHtml(dateText(s.session_date))}</span>
          <span class="pill">👥 ${rs.length}/${s.max_players} joueurs</span>
        </div>
        ${s.description ? `<p class="session-desc">${escapeHtml(s.description)}</p>` : ""}
        <div class="participants">Participants : ${names || "Pas encore de joueur"}</div>
        <div class="card-actions">${action}${manage}</div>
      </article>`;
    }).join("");
    box.querySelectorAll("[data-join]").forEach(b=>b.onclick=()=>register(b.dataset.join));
    box.querySelectorAll("[data-unjoin]").forEach(b=>b.onclick=()=>unregister(b.dataset.unjoin));
    box.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteSession(b.dataset.delete));
    box.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editSession(sessions.find(s=>s.id===b.dataset.edit)));

    box.querySelectorAll("[data-join]").forEach(b =>
      b.onclick = () => register(b.dataset.join)
    );
    box.querySelectorAll("[data-unjoin]").forEach(b =>
      b.onclick = () => unregister(b.dataset.unjoin)
    );
    box.querySelectorAll("[data-delete]").forEach(b =>
      b.onclick = () => deleteSession(b.dataset.delete)
    );
    box.querySelectorAll("[data-edit]").forEach(b =>
      b.onclick = () => editSession(sessions.find(s => s.id === b.dataset.edit))
    );
  }
  async function register(id){
    const {error}=await client.from("registrations").insert({session_id:id,user_id:currentUser.id});
    if(error)toast(error.message.includes("duplicate")?"Tu es déjà inscrit.":error.message);else toast("Inscription confirmée ! 🎉");await loadSessions();

  async function register(id) {
    const { error } = await client.from("registrations")
      .insert({ session_id: id, user_id: currentUser.id });

    if (error) {
      toast(error.message.includes("duplicate") ? "Tu es déjà inscrit." : error.message);
    } else {
      toast("Inscription confirmée ! 🎉");
    }

    await loadSessions();
  }
  async function unregister(id){
    const {error}=await client.from("registrations").delete().eq("session_id",id).eq("user_id",currentUser.id);
    if(error)toast(error.message);else toast("Désinscription effectuée.");await loadSessions();

  async function unregister(id) {
    const { error } = await client.from("registrations")
      .delete()
      .eq("session_id", id)
      .eq("user_id", currentUser.id);

    if (error) toast(error.message);
    else toast("Désinscription effectuée.");

    await loadSessions();
  }
  async function deleteSession(id){
    if(!confirm("Supprimer définitivement cette partie ?"))return;
    const {error}=await client.from("sessions").delete().eq("id",id);
    if(error)toast(error.message);else toast("Partie supprimée.");await loadSessions();

  async function deleteSession(id) {
    if (!confirm("Supprimer définitivement cette partie ?")) return;

    const { error } = await client.from("sessions").delete().eq("id", id);

    if (error) toast(error.message);
    else toast("Partie supprimée.");

    await loadSessions();
  }
  async function editSession(s){
    if(!s)return;const game=prompt("Nom du jeu :",s.game_name);if(game===null)return;
    const date=prompt("Date (AAAA-MM-JJ) :",s.session_date);if(date===null)return;
    const max=prompt("Nombre maximum de joueurs :",s.max_players);if(max===null)return;
    const desc=prompt("Description (facultative) :",s.description||"");if(desc===null)return;
    const {error}=await client.from("sessions").update({game_name:game.trim(),session_date:date,max_players:Number(max),description:desc.trim()||null}).eq("id",s.id);
    if(error)toast(error.message);else toast("Partie modifiée.");await loadSessions();

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

    const { error } = await client.from("sessions").update({
      game_name: game.trim(),
      session_date: date,
      max_players: Number(max),
      description: desc.trim() || null
    }).eq("id", s.id);

    if (error) toast(error.message);
    else toast("Partie modifiée.");

    await loadSessions();
  }
  async function loadMembers(){
    const {data,error}=await client.from("profiles").select("id,first_name,last_name,role,created_at").order("created_at",{ascending:false});
    const box=$("admin-members");if(error){box.textContent=error.message;return;}
    if(!data?.length){box.textContent="Aucun membre.";return;}
    const isSuper=currentProfile?.role==="super_admin";
    box.innerHTML=data.map(m=>`<div class="admin-member"><div>${escapeHtml((m.first_name+" "+m.last_name).trim()||"Membre")} <small>${escapeHtml(m.role)} • ${escapeHtml(m.id.slice(0,8))}…</small></div>${isSuper&&m.id!==currentUser.id?`<select data-role="${m.id}" aria-label="Rôle du membre"><option value="member" ${m.role==="member"?"selected":""}>Membre</option><option value="admin" ${m.role==="admin"?"selected":""}>Administrateur</option></select>`:`<span class="admin-tag">${m.role==="super_admin"?"Super admin":m.role==="admin"?"Admin":"Membre"}</span>`}</div>`).join("");
    box.querySelectorAll("[data-role]").forEach(sel=>sel.onchange=async()=>{const {error}=await client.from("profiles").update({role:sel.value}).eq("id",sel.dataset.role);if(error)toast(error.message);else{toast("Rôle mis à jour.");await loadMembers();}});

  async function loadMembers() {
    const { data, error } = await client.from("profiles")
      .select("id,username,first_name,last_name,role,created_at")
      .order("created_at", { ascending: false });

    const box = $("admin-members");

    if (error) {
      box.textContent = error.message;
      return;
    }

    if (!data?.length) {
      box.textContent = "Aucun membre.";
      return;
    }

    const isSuper = currentProfile?.role === "super_admin";

    box.innerHTML = data.map(m => `
      <div class="admin-member">
        <div>
          ${escapeHtml((m.username ? "@" + m.username + " • " : "") + (m.first_name || "Membre"))}
          <small>${escapeHtml(m.role)} • ${escapeHtml(m.id.slice(0, 8))}…</small>
        </div>
        ${isSuper && m.id !== currentUser.id
          ? `<select data-role="${m.id}" aria-label="Rôle du membre">
              <option value="member" ${m.role === "member" ? "selected" : ""}>Membre</option>
              <option value="admin" ${m.role === "admin" ? "selected" : ""}>Administrateur</option>
            </select>`
          : `<span class="admin-tag">${m.role === "super_admin" ? "Super admin" : m.role === "admin" ? "Admin" : "Membre"}</span>`
        }
      </div>
    `).join("");

    box.querySelectorAll("[data-role]").forEach(sel => {
      sel.onchange = async () => {
        const { error } = await client.from("profiles")
          .update({ role: sel.value })
          .eq("id", sel.dataset.role);

        if (error) toast(error.message);
        else {
          toast("Rôle mis à jour.");
          await loadMembers();
        }
      };
    });
  }
  $("refresh-btn").addEventListener("click",loadSessions);
  $("session-date").min=new Date().toISOString().slice(0,10);
  client.auth.onAuthStateChange(()=>setTimeout(refreshAuth,0));

  $("refresh-btn").addEventListener("click", loadSessions);
  $("session-date").min = new Date().toISOString().slice(0, 10);

  client.auth.onAuthStateChange(() => setTimeout(refreshAuth, 0));
  refreshAuth();
})();
})();
