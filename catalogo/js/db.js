/*
 * Camada de dados do catálogo.
 * Mesma interface para o modo "local" (localStorage) e o modo "firebase" (nuvem).
 *
 * Perfil:   { uid, name, email, role, slug, ownerUid?, expiresAt (ms|null), active, createdAt, lastLogin }
 *           role: 'admin' | 'user' (dono da loja) | 'seller' (vendedor) | 'rep' (representante)
 * Catálogo público: { uid, slug, expiresAt, active, store, products: [{ code, name, ..., promo }], updatedAt }
 *           (SEM preços — qualquer pessoa pode ler)
 * Preços (protegidos): { code: { price, promoPrice } } — só dono, vendedores, representantes e admin leem.
 */
(function () {
  const CFG = window.CATALOGO_CONFIG || { modo: "local", admins: [] };
  const DAY = 86400000;
  const TEAM = ["seller", "rep"];
  const ROLE_LABEL = { admin: "Administrador", user: "Loja", seller: "Vendedor", rep: "Representante" };

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
    return { name: name || "", whatsapp: "", instagram: "", about: "", cover: "", driveFolderId: "", accent: "#ff6a36", sellers: [] };
  }

  function denyMessage(status, team) {
    if (team) return status === "bloqueado" ? "Seu acesso foi bloqueado pela loja." : "O acesso desta loja está suspenso. Fale com o responsável.";
    return status === "bloqueado"
      ? "Seu acesso está bloqueado. Fale com o administrador."
      : "Seu tempo de acesso terminou. Fale com o administrador para renovar.";
  }

  const isPromo = (p) => p.price != null && p.promoPrice != null && p.promoPrice < p.price;

  /** Separa os produtos em parte pública (sem preço) e tabela de preços protegida. */
  function splitProducts(products) {
    const prices = {};
    const pub = products.map((p) => {
      const { price, promoPrice, ...rest } = p;
      if (price != null || promoPrice != null) prices[String(p.code)] = { price: price ?? null, promoPrice: promoPrice ?? null };
      return { ...rest, promo: isPromo(p) };
    });
    return { pub, prices };
  }
  function mergePrices(products, prices) {
    return (products || []).map((p) => {
      const pr = (prices && prices[String(p.code)]) || {};
      // compatibilidade: catálogos antigos guardavam o preço no próprio produto
      return { ...p, price: pr.price ?? p.price ?? null, promoPrice: pr.promoPrice ?? p.promoPrice ?? null };
    });
  }
  /** Garante que nenhum preço saia na versão pública (também para dados antigos). */
  function stripPublic(cat) {
    if (!cat) return cat;
    return { ...cat, products: (cat.products || []).map((p) => {
      const { price, promoPrice, ...rest } = p;
      return { ...rest, promo: p.promo ?? isPromo(p) };
    }) };
  }
  const hasLegacyPrices = (cat) => (cat?.products || []).some((p) => "price" in p || "promoPrice" in p);

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* ------------------------------------------------------------------ */
  /* MODO LOCAL (teste: tudo fica no navegador)                          */
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
    _prices() { return this._read("cat_prices", {}); },
    _public(u) { if (!u) return null; const { passHash, ...rest } = u; return rest; },
    _catBySlug(slug) { return Object.values(this._catalogs()).find((c) => c.slug === slug) || null; },

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
      const team = TEAM.includes(u.role);
      let st = accessStatus(u);
      if (st === "ativo" && team && accessStatus(this._catBySlug(u.slug)) !== "ativo") st = "loja";
      if (st !== "ativo") throw new Error(denyMessage(st, team));
      u.lastLogin = Date.now();
      this._write("cat_users", users);
      sessionStorage.setItem("cat_session", u.uid);
      return this._public(u);
    },

    async logout() { sessionStorage.removeItem("cat_session"); },

    async setMyWhatsapp(whatsapp) {
      const me = await this.current();
      if (!me) throw new Error("Faça login novamente.");
      return this.updateUser(me.uid, { whatsapp });
    },

    async current() {
      const uid = sessionStorage.getItem("cat_session");
      return this._public(this._users().find((x) => x.uid === uid));
    },

    async listUsers() { return this._users().map((u) => this._public(u)); },

    async _addAccount(profile, password) {
      const users = this._users();
      if (users.some((u) => u.email === profile.email)) throw new Error("Já existe um usuário com esse e-mail.");
      if (password.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
      const uid = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      users.push({ uid, ...profile, passHash: await sha256(password) });
      this._write("cat_users", users);
      return { uid, ...profile };
    },

    async createUser({ name, email, password, slug, expiresAt }) {
      email = email.trim().toLowerCase();
      slug = slugify(slug || name);
      if (!slug) throw new Error("Informe o endereço do catálogo.");
      if (this._catBySlug(slug)) throw new Error("Esse endereço de catálogo já está em uso.");
      const p = await this._addAccount({ name, email, role: "user", slug, expiresAt, active: true, createdAt: Date.now(), lastLogin: null }, password);
      const cats = this._catalogs();
      cats[p.uid] = { uid: p.uid, slug, expiresAt, active: true, store: emptyStore(name), products: [], updatedAt: Date.now() };
      this._write("cat_catalogs", cats);
      return p;
    },

    async updateUser(uid, patch) {
      const users = this._users();
      const u = users.find((x) => x.uid === uid);
      if (!u) throw new Error("Usuário não encontrado.");
      if (patch.password) {
        if (patch.password.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
        u.passHash = await sha256(patch.password); delete patch.password;
      }
      Object.assign(u, patch);
      this._write("cat_users", users);
      const cats = this._catalogs();
      if (u.role === "user" && cats[uid]) {
        if ("expiresAt" in patch) cats[uid].expiresAt = patch.expiresAt;
        if ("active" in patch) cats[uid].active = patch.active;
        this._write("cat_catalogs", cats);
      }
      return this._public(u);
    },

    async deleteUser(uid) {
      const u = this._users().find((x) => x.uid === uid);
      // remove a conta e, se for uma loja, a equipe dela
      this._write("cat_users", this._users().filter((x) => x.uid !== uid && x.ownerUid !== uid));
      const cats = this._catalogs(); delete cats[uid]; this._write("cat_catalogs", cats);
      if (u && u.slug && u.role === "user") { const pr = this._prices(); delete pr[u.slug]; this._write("cat_prices", pr); }
    },

    /* equipe da loja */
    async createMember(owner, { name, email, password, role, whatsapp }) {
      if (!TEAM.includes(role)) throw new Error("Tipo de conta inválido.");
      return this._addAccount({ name, email: email.trim().toLowerCase(), role, whatsapp: whatsapp || "", slug: owner.slug, ownerUid: owner.uid,
        expiresAt: null, active: true, createdAt: Date.now(), lastLogin: null }, password);
    },
    async listMembers(owner) { return this._users().filter((u) => u.ownerUid === owner.uid).map((u) => this._public(u)); },
    async updateMember(owner, uid, patch) {
      const m = this._users().find((u) => u.uid === uid);
      if (!m || m.ownerUid !== owner.uid) throw new Error("Conta não pertence à sua loja.");
      return this.updateUser(uid, patch);
    },
    async deleteMember(owner, uid) {
      const m = this._users().find((u) => u.uid === uid);
      if (!m || m.ownerUid !== owner.uid) throw new Error("Conta não pertence à sua loja.");
      this._write("cat_users", this._users().filter((u) => u.uid !== uid));
    },

    /* catálogo */
    async getMyCatalog(profile) {
      const c = this._catalogs()[profile.uid];
      return c ? { ...c, legacy: hasLegacyPrices(c), products: mergePrices(c.products, this._prices()[c.slug]) } : null;
    },

    async saveMyCatalog(profile, { store, products }) {
      const cats = this._catalogs();
      const c = cats[profile.uid];
      if (!c) throw new Error("Catálogo não encontrado.");
      const st = accessStatus(c);
      if (st !== "ativo") throw new Error(denyMessage(st));
      const { pub, prices } = splitProducts(products);
      c.store = store; c.products = pub; c.updatedAt = Date.now();
      this._write("cat_catalogs", cats);
      const all = this._prices(); all[c.slug] = prices; this._write("cat_prices", all);
      return { ...c, products };
    },

    async getCatalogBySlug(slug) { return stripPublic(this._catBySlug(slug)); },

    async getPrices(slug) {
      const me = await this.current();
      if (!me) return null;
      const allowed = me.role === "admin" || (me.slug === slug && (me.role === "user" || TEAM.includes(me.role)) && me.active !== false);
      if (!allowed) return null;
      const c = this._catBySlug(slug);
      const legacy = {};
      (c?.products || []).forEach((p) => { if ("price" in p) legacy[p.code] = { price: p.price, promoPrice: p.promoPrice }; });
      return { ...legacy, ...(this._prices()[slug] || {}) };
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
  function authError(e) {
    if (e.code === "auth/email-already-in-use") return new Error("Já existe um usuário com esse e-mail.");
    if (e.code === "auth/weak-password") return new Error("A senha precisa ter pelo menos 6 caracteres.");
    if (e.code === "auth/invalid-email") return new Error("E-mail inválido.");
    return new Error(e.message);
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
    _users() { return this.db.collection("users"); },
    _cat(slug) { return this.db.collection("catalogs").doc(slug); },
    _priceDoc(slug) { return this._cat(slug).collection("private").doc("prices"); },

    async _profile(user) {
      if (!user) return null;
      const ref = this._users().doc(user.uid);
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
      try { await this.auth.signInWithEmailAndPassword(email.trim(), password); }
      catch (e) { throw new Error("E-mail ou senha incorretos."); }
      const p = await this._profile(this.auth.currentUser);
      const team = p && TEAM.includes(p.role);
      let st = accessStatus(p);
      if (st === "ativo" && team && accessStatus(await this.getCatalogBySlug(p.slug)) !== "ativo") st = "loja";
      if (st !== "ativo") {
        await this.auth.signOut();
        throw new Error(p ? denyMessage(st, team) : "Usuário sem cadastro no catálogo.");
      }
      await this._users().doc(p.uid).update({ lastLogin: Date.now() });
      return p;
    },

    async logout() { await this.auth.signOut(); },

    async setMyWhatsapp(whatsapp) {
      await this._ready;
      const u = this.auth.currentUser;
      if (!u) throw new Error("Faça login novamente.");
      await this._users().doc(u.uid).update({ whatsapp });
    },

    async current() { await this._ready; return this._profile(this.auth.currentUser); },

    async listUsers() {
      const snap = await this._users().get();
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    },

    /** Cria a conta de login numa instância secundária, sem desconectar quem está criando. */
    async _newAuth(email, password) {
      const second = firebase.apps.find((a) => a.name === "secundario") || firebase.initializeApp(CFG.firebase, "secundario");
      try {
        const cred = await second.auth().createUserWithEmailAndPassword(email, password);
        await second.auth().signOut();
        return cred.user.uid;
      } catch (e) { throw authError(e); }
    },

    async createUser({ name, email, password, slug, expiresAt }) {
      email = email.trim().toLowerCase();
      slug = slugify(slug || name);
      if (!slug) throw new Error("Informe o endereço do catálogo.");
      const catRef = this._cat(slug);
      if ((await catRef.get()).exists) throw new Error("Esse endereço de catálogo já está em uso.");
      const uid = await this._newAuth(email, password);
      const profile = { name, email, role: "user", slug, expiresAt, active: true, createdAt: Date.now(), lastLogin: null };
      await this._users().doc(uid).set(profile);
      await catRef.set({ uid, slug, expiresAt, active: true, store: emptyStore(name), products: [], updatedAt: Date.now() });
      return { uid, ...profile };
    },

    async updateUser(uid, patch) {
      if (patch.password) throw new Error("No modo Firebase, a senha é trocada pelo e-mail de redefinição.");
      const ref = this._users().doc(uid);
      await ref.update(patch);
      const p = { uid, ...(await ref.get()).data() };
      if (p.role === "user" && p.slug && ("expiresAt" in patch || "active" in patch)) {
        const sync = {};
        if ("expiresAt" in patch) sync.expiresAt = patch.expiresAt;
        if ("active" in patch) sync.active = patch.active;
        await this._cat(p.slug).update(sync);
      }
      return p;
    },

    async sendReset(email) { await this.auth.sendPasswordResetEmail(email); },

    async deleteUser(uid) {
      const ref = this._users().doc(uid);
      const p = (await ref.get()).data();
      if (p && p.role === "user") {
        const team = await this._users().where("ownerUid", "==", uid).get();
        await Promise.all(team.docs.map((d) => d.ref.delete()));
        if (p.slug) {
          await this._priceDoc(p.slug).delete().catch(() => {});
          await this._cat(p.slug).delete();
        }
      }
      await ref.delete();
      // A conta de login continua no Firebase Authentication, mas sem perfil ela não entra mais.
    },

    /* equipe da loja */
    async createMember(owner, { name, email, password, role, whatsapp }) {
      if (!TEAM.includes(role)) throw new Error("Tipo de conta inválido.");
      email = email.trim().toLowerCase();
      const uid = await this._newAuth(email, password);
      const profile = { name, email, role, whatsapp: whatsapp || "", slug: owner.slug, ownerUid: owner.uid, expiresAt: null, active: true, createdAt: Date.now(), lastLogin: null };
      await this._users().doc(uid).set(profile);
      return { uid, ...profile };
    },
    async listMembers(owner) {
      const snap = await this._users().where("ownerUid", "==", owner.uid).get();
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    },
    async updateMember(owner, uid, patch) { return this.updateUser(uid, patch); },
    async deleteMember(owner, uid) { await this._users().doc(uid).delete(); },

    /* catálogo */
    async getMyCatalog(profile) {
      const s = await this._cat(profile.slug).get();
      if (!s.exists) return null;
      const pr = await this._priceDoc(profile.slug).get();
      const c = s.data();
      return { ...c, legacy: hasLegacyPrices(c), products: mergePrices(c.products, pr.exists ? pr.data().items : {}) };
    },

    async saveMyCatalog(profile, { store, products }) {
      const { pub, prices } = splitProducts(products);
      const data = { store, products: pub, updatedAt: Date.now() };
      if (new Blob([JSON.stringify(data)]).size > 950000) throw new Error("Catálogo grande demais para salvar (limite ~1 MB). Use uma capa menor.");
      try {
        await this._priceDoc(profile.slug).set({ items: prices, updatedAt: Date.now() });
        await this._cat(profile.slug).update(data);
      } catch (e) { throw new Error("Não foi possível salvar. Verifique se o seu acesso está ativo."); }
      return { ...(await this._cat(profile.slug).get()).data(), products };
    },

    async getCatalogBySlug(slug) {
      const s = await this._cat(slug).get();
      return s.exists ? stripPublic(s.data()) : null;
    },

    async getPrices(slug) {
      await this._ready;
      if (!this.auth.currentUser) return null;
      try {
        const pr = await this._priceDoc(slug).get();
        const items = pr.exists ? pr.data().items || {} : {};
        // compatibilidade com catálogos ainda não migrados
        const c = (await this._cat(slug).get()).data();
        const legacy = {};
        (c?.products || []).forEach((p) => { if ("price" in p) legacy[p.code] = { price: p.price, promoPrice: p.promoPrice }; });
        return { ...legacy, ...items };
      } catch { return null; } // sem permissão
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
    DAY, TEAM, ROLE_LABEL, accessStatus, slugify, hasLegacyPrices,
    init() { return (initPromise = initPromise || impl.init()); }
  };
  ["login", "logout", "current", "listUsers", "createUser", "updateUser", "deleteUser",
   "createMember", "listMembers", "updateMember", "deleteMember",
   "setMyWhatsapp", "getMyCatalog", "saveMyCatalog", "getCatalogBySlug", "getPrices", "listCatalogStats", "sendReset"].forEach((fn) => {
    window.DB[fn] = async (...args) => {
      await window.DB.init();
      if (!impl[fn]) throw new Error("Função indisponível neste modo.");
      return impl[fn](...args);
    };
  });
})();
