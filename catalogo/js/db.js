/*
 * Camada de dados do catálogo.
 * Mesma interface para o modo "local" (localStorage) e o modo "firebase" (nuvem).
 *
 * Perfil:   { uid, name, email, role: 'admin'|'user', slug, expiresAt (ms|null), active, createdAt, lastLogin }
 * Catálogo: { uid, slug, expiresAt, active, store: {...}, products: [...], updatedAt }
 */
(function () {
  const CFG = window.CATALOGO_CONFIG || { modo: "local", admins: [] };
  const DAY = 86400000;

  function accessStatus(p) {
    if (!p) return "inexistente";
    if (p.role === "admin") return "ativo";
    if (p.active === false) return "bloqueado";
    if (p.expiresAt && p.expiresAt < Date.now()) return "expirado";
    return "ativo";
  }

  function slugify(s) {
    return String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  }

  function emptyStore(name) {
    return { name: name || "", whatsapp: "", instagram: "", about: "", cover: "", driveFolderId: "", accent: "#ff6a36" };
  }

  function denyMessage(status) {
    return status === "bloqueado"
      ? "Seu acesso está bloqueado. Fale com o administrador."
      : "Seu tempo de acesso terminou. Fale com o administrador para renovar.";
  }

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* ------------------------------------------------------------------ */
  /* MODO LOCAL                                                          */
  /* ------------------------------------------------------------------ */
  const Local = {
    _read(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    _write(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); }
      catch (e) { throw new Error("Sem espaço no navegador. Use uma capa menor ou o modo Firebase."); }
    },
    _users() { return this._read("cat_users", []); },
    _catalogs() { return this._read("cat_catalogs", {}); },
    _public(u) { if (!u) return null; const { passHash, ...rest } = u; return rest; },

    async init() {
      if (!this._users().length) {
        const email = (CFG.admins && CFG.admins[0]) || "admin@catalogo.com";
        this._write("cat_users", [{
          uid: "admin", name: "Administrador", email, role: "admin", slug: "", expiresAt: null,
          active: true, createdAt: Date.now(), lastLogin: null, passHash: await sha256("admin123")
        }]);
      }
    },

    async login(email, password) {
      email = email.trim().toLowerCase();
      const users = this._users();
      const u = users.find((x) => x.email === email);
      if (!u || u.passHash !== (await sha256(password))) throw new Error("E-mail ou senha incorretos.");
      const st = accessStatus(u);
      if (st !== "ativo") throw new Error(denyMessage(st));
      u.lastLogin = Date.now();
      this._write("cat_users", users);
      sessionStorage.setItem("cat_session", u.uid);
      return this._public(u);
    },

    async logout() { sessionStorage.removeItem("cat_session"); },

    async current() {
      const uid = sessionStorage.getItem("cat_session");
      const u = this._users().find((x) => x.uid === uid);
      return this._public(u);
    },

    async listUsers() { return this._users().map((u) => this._public(u)); },

    async createUser({ name, email, password, slug, expiresAt }) {
      email = email.trim().toLowerCase();
      slug = slugify(slug || name);
      const users = this._users();
      if (users.some((u) => u.email === email)) throw new Error("Já existe um usuário com esse e-mail.");
      if (!slug) throw new Error("Informe o endereço do catálogo.");
      const cats = this._catalogs();
      if (Object.values(cats).some((c) => c.slug === slug)) throw new Error("Esse endereço de catálogo já está em uso.");
      const uid = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const profile = { uid, name, email, role: "user", slug, expiresAt, active: true, createdAt: Date.now(), lastLogin: null };
      users.push({ ...profile, passHash: await sha256(password) });
      cats[uid] = { uid, slug, expiresAt, active: true, store: emptyStore(name), products: [], updatedAt: Date.now() };
      this._write("cat_users", users);
      this._write("cat_catalogs", cats);
      return profile;
    },

    async updateUser(uid, patch) {
      const users = this._users();
      const u = users.find((x) => x.uid === uid);
      if (!u) throw new Error("Usuário não encontrado.");
      if (patch.password) { u.passHash = await sha256(patch.password); delete patch.password; }
      Object.assign(u, patch);
      this._write("cat_users", users);
      const cats = this._catalogs();
      if (cats[uid]) {
        if ("expiresAt" in patch) cats[uid].expiresAt = patch.expiresAt;
        if ("active" in patch) cats[uid].active = patch.active;
        this._write("cat_catalogs", cats);
      }
      return this._public(u);
    },

    async deleteUser(uid) {
      this._write("cat_users", this._users().filter((u) => u.uid !== uid));
      const cats = this._catalogs(); delete cats[uid]; this._write("cat_catalogs", cats);
    },

    async getMyCatalog(profile) { return this._catalogs()[profile.uid] || null; },

    async saveMyCatalog(profile, { store, products }) {
      const cats = this._catalogs();
      const c = cats[profile.uid];
      if (!c) throw new Error("Catálogo não encontrado.");
      const st = accessStatus(c);
      if (st !== "ativo") throw new Error(denyMessage(st));
      c.store = store; c.products = products; c.updatedAt = Date.now();
      this._write("cat_catalogs", cats);
      return c;
    },

    async getCatalogBySlug(slug) {
      return Object.values(this._catalogs()).find((c) => c.slug === slug) || null;
    },

    async listCatalogStats() {
      const out = {};
      Object.values(this._catalogs()).forEach((c) => { out[c.uid] = { products: c.products.length, updatedAt: c.updatedAt }; });
      return out;
    }
  };

  /* ------------------------------------------------------------------ */
  /* MODO FIREBASE                                                       */
  /* ------------------------------------------------------------------ */
  const FB_VER = "10.12.2";
  function loadScript(src) {
    return new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = () => fail(new Error("Não foi possível carregar " + src));
      document.head.appendChild(s);
    });
  }

  const Firebase = {
    async init() {
      const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
      await loadScript(base + "firebase-app-compat.js");
      await loadScript(base + "firebase-auth-compat.js");
      await loadScript(base + "firebase-firestore-compat.js");
      this.app = firebase.initializeApp(CFG.firebase);
      this.auth = firebase.auth();
      this.db = firebase.firestore();
      this._ready = new Promise((ok) => {
        const off = this.auth.onAuthStateChanged((user) => { off(); ok(user); });
      });
    },

    async _profile(user) {
      if (!user) return null;
      const ref = this.db.collection("users").doc(user.uid);
      const snap = await ref.get();
      if (snap.exists) return { uid: user.uid, ...snap.data() };
      const email = (user.email || "").toLowerCase();
      if ((CFG.admins || []).map((e) => e.toLowerCase()).includes(email)) {
        const profile = { name: "Administrador", email, role: "admin", slug: "", expiresAt: null, active: true, createdAt: Date.now(), lastLogin: Date.now() };
        await ref.set(profile);
        return { uid: user.uid, ...profile };
      }
      return null;
    },

    async login(email, password) {
      try {
        await this.auth.signInWithEmailAndPassword(email.trim(), password);
      } catch (e) {
        throw new Error("E-mail ou senha incorretos.");
      }
      const p = await this._profile(this.auth.currentUser);
      const st = accessStatus(p);
      if (st !== "ativo") {
        await this.auth.signOut();
        throw new Error(p ? denyMessage(st) : "Usuário sem cadastro no catálogo.");
      }
      await this.db.collection("users").doc(p.uid).update({ lastLogin: Date.now() });
      return p;
    },

    async logout() { await this.auth.signOut(); },

    async current() {
      await this._ready;
      return this._profile(this.auth.currentUser);
    },

    async listUsers() {
      const snap = await this.db.collection("users").get();
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    },

    async createUser({ name, email, password, slug, expiresAt }) {
      email = email.trim().toLowerCase();
      slug = slugify(slug || name);
      if (!slug) throw new Error("Informe o endereço do catálogo.");
      const catRef = this.db.collection("catalogs").doc(slug);
      if ((await catRef.get()).exists) throw new Error("Esse endereço de catálogo já está em uso.");
      // Instância secundária: cria a conta sem desconectar o administrador.
      const second = firebase.apps.find((a) => a.name === "secundario") || firebase.initializeApp(CFG.firebase, "secundario");
      let uid;
      try {
        const cred = await second.auth().createUserWithEmailAndPassword(email, password);
        uid = cred.user.uid;
        await second.auth().signOut();
      } catch (e) {
        if (e.code === "auth/email-already-in-use") throw new Error("Já existe um usuário com esse e-mail.");
        if (e.code === "auth/weak-password") throw new Error("A senha precisa ter pelo menos 6 caracteres.");
        throw new Error(e.message);
      }
      const profile = { name, email, role: "user", slug, expiresAt, active: true, createdAt: Date.now(), lastLogin: null };
      await this.db.collection("users").doc(uid).set(profile);
      await catRef.set({ uid, slug, expiresAt, active: true, store: emptyStore(name), products: [], updatedAt: Date.now() });
      return { uid, ...profile };
    },

    async updateUser(uid, patch) {
      if (patch.password) throw new Error("No modo Firebase, a senha é trocada pelo e-mail de redefinição.");
      const ref = this.db.collection("users").doc(uid);
      await ref.update(patch);
      const p = { uid, ...(await ref.get()).data() };
      if (p.slug && ("expiresAt" in patch || "active" in patch)) {
        const sync = {};
        if ("expiresAt" in patch) sync.expiresAt = patch.expiresAt;
        if ("active" in patch) sync.active = patch.active;
        await this.db.collection("catalogs").doc(p.slug).update(sync);
      }
      return p;
    },

    async sendReset(email) { await this.auth.sendPasswordResetEmail(email); },

    async deleteUser(uid) {
      const ref = this.db.collection("users").doc(uid);
      const p = (await ref.get()).data();
      if (p && p.slug) await this.db.collection("catalogs").doc(p.slug).delete();
      await ref.delete();
      // A conta de login continua no Firebase Authentication, mas sem perfil ela não entra mais.
    },

    async getMyCatalog(profile) {
      const s = await this.db.collection("catalogs").doc(profile.slug).get();
      return s.exists ? s.data() : null;
    },

    async saveMyCatalog(profile, { store, products }) {
      const ref = this.db.collection("catalogs").doc(profile.slug);
      const data = { store, products, updatedAt: Date.now() };
      const size = new Blob([JSON.stringify(data)]).size;
      if (size > 950000) throw new Error("Catálogo grande demais para salvar (limite ~1 MB). Use uma capa menor.");
      try { await ref.update(data); }
      catch (e) { throw new Error("Não foi possível salvar. Verifique se o seu acesso está ativo."); }
      return (await ref.get()).data();
    },

    async getCatalogBySlug(slug) {
      const s = await this.db.collection("catalogs").doc(slug).get();
      return s.exists ? s.data() : null;
    },

    async listCatalogStats() {
      const snap = await this.db.collection("catalogs").get();
      const out = {};
      snap.docs.forEach((d) => { const c = d.data(); out[c.uid] = { products: (c.products || []).length, updatedAt: c.updatedAt }; });
      return out;
    }
  };

  const impl = CFG.modo === "firebase" ? Firebase : Local;
  let initPromise = null;

  window.DB = {
    mode: CFG.modo === "firebase" ? "firebase" : "local",
    DAY, accessStatus, slugify,
    init() { return (initPromise = initPromise || impl.init()); }
  };
  ["login", "logout", "current", "listUsers", "createUser", "updateUser", "deleteUser",
   "getMyCatalog", "saveMyCatalog", "getCatalogBySlug", "listCatalogStats", "sendReset"].forEach((fn) => {
    window.DB[fn] = async (...args) => {
      await window.DB.init();
      if (!impl[fn]) throw new Error("Função indisponível neste modo.");
      return impl[fn](...args);
    };
  });
})();
