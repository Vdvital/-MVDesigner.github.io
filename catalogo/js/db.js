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
      : "Seu tempo de acesso terminou. Renove seu plano para voltar a usar o catálogo.";
  }

  const isPromo = (p) => p.price != null && p.promoPrice != null && p.promoPrice < p.price;

  /** Separa os produtos em parte pública (sem preço) e tabela de preços protegida. */
  function splitProducts(products) {
    const prices = {};
    const pub = products.map((p) => {
      const { price, promoPrice, ...rest } = p;
      if (price != null || promoPrice != null) prices[String(p.code)] = { price: price ?? null, promoPrice: promoPrice ?? null };
      return { ...rest, promo: isPromo(p) || !!p.tagPromo };
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
      return { ...rest, promo: p.promo ?? (isPromo(p) || !!p.tagPromo) };
    }) };
  }
  /* estatísticas: um registro por loja por dia (id "slug_AAAA-MM-DD") */
  const STAT_MAPS = ["v", "c", "o", "s", "sz", "cat"];
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const lastDays = (n) => Array.from({ length: n }, (_, i) => dayKey(new Date(Date.now() - (n - 1 - i) * 86400000)));

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

    async createUser({ name, email, password, slug, expiresAt, whatsapp = "", cnpj = "", responsavel = "" }) {
      email = email.trim().toLowerCase();
      slug = slugify(slug || name);
      if (!slug) throw new Error("Informe o endereço do catálogo.");
      if (this._catBySlug(slug)) throw new Error("Esse endereço de catálogo já está em uso.");
      const p = await this._addAccount({ name, email, role: "user", slug, expiresAt, active: true, createdAt: Date.now(), lastLogin: null, whatsapp, cnpj, responsavel }, password);
      const cats = this._catalogs();
      cats[p.uid] = { uid: p.uid, slug, expiresAt, active: true, store: { ...emptyStore(name), whatsapp: String(whatsapp).replace(/\D/g, "") }, products: [], updatedAt: Date.now() };
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

    async saveQuote(q) {
      const all = this._read("cat_quotes", {});
      const id = "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      all[id] = { ...q, createdAt: Date.now() };
      this._write("cat_quotes", all);
      return id;
    },
    async getQuote(id) { return this._read("cat_quotes", {})[id] || null; },
    async createPedido(data) {
      const all = this._read("cat_pedidos", {});
      const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      all[id] = { ...data, status: "aguardando_pagamento", createdAt: Date.now() };
      this._write("cat_pedidos", all); return id;
    },
    async pedidoPago(id) {
      const all = this._read("cat_pedidos", {});
      if (all[id] && all[id].status === "aguardando_pagamento") { all[id].status = "pagamento_informado"; all[id].paidAt = Date.now(); this._write("cat_pedidos", all); }
    },
    async listPedidos() { return Object.entries(this._read("cat_pedidos", {})).map(([id, x]) => ({ id, ...x })); },
    watchPedidos(cb) {
      // modo de teste: confere a cada 5 s e quando outra aba grava
      const run = () => this.listPedidos().then(cb);
      run();
      const t = setInterval(run, 5000);
      const onStorage = (e) => { if (e.key === "cat_pedidos") run(); };
      addEventListener("storage", onStorage);
      return () => { clearInterval(t); removeEventListener("storage", onStorage); };
    },
    async updatePedido(id, patch) { const all = this._read("cat_pedidos", {}); if (all[id]) { Object.assign(all[id], patch); this._write("cat_pedidos", all); } },
    async deletePedido(id) { const all = this._read("cat_pedidos", {}); this._write("cat_pedidos", Object.fromEntries(Object.entries(all).filter(([k]) => k !== id))); },
    async track(slug, delta) {
      const all = this._read("cat_stats", {});
      const day = dayKey(), id = `${slug}_${day}`;
      const d = all[id] || { slug, day, visits: 0 };
      d.visits = (d.visits || 0) + (delta.visits || 0);
      STAT_MAPS.forEach((m) => Object.entries(delta[m] || {}).forEach(([k, n]) => { d[m] = d[m] || {}; d[m][k] = (d[m][k] || 0) + n; }));
      all[id] = d; this._write("cat_stats", all);
    },
    async getStats(slug, days) {
      const all = this._read("cat_stats", {});
      return lastDays(days).map((day) => all[`${slug}_${day}`] || { slug, day, visits: 0 });
    },
    async seen(me, first) {
      const users = this._users(); const u = users.find((x) => x.uid === me.uid);
      if (u) { u.lastSeen = Date.now(); this._write("cat_users", users); }
      if (first) {
        const all = this._read("cat_acessos", {}); const day = dayKey();
        const d = all[day] || { day, n: 0, u: {} };
        d.n += 1; d.u[me.uid] = (d.u[me.uid] || 0) + 1; all[day] = d; this._write("cat_acessos", all);
      }
    },
    async listAcessos(days) {
      const all = this._read("cat_acessos", {});
      return lastDays(days).map((day) => all[day] || { day, n: 0, u: {} });
    },
    async listAllStats(days) {
      const from = lastDays(days)[0];
      return Object.values(this._read("cat_stats", {})).filter((d) => d.day >= from);
    },
    async listQuotes(owner) {
      return Object.entries(this._read("cat_quotes", {}))
        .filter(([, q]) => q.slug === owner.slug)
        .map(([id, q]) => ({ id, ...q }));
    },

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
      Object.values(this._catalogs()).forEach((c) => { out[c.uid] = { products: c.products.length, updatedAt: c.updatedAt, whatsapp: (c.store && c.store.whatsapp) || "" }; });
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
      this.auth.languageCode = "pt"; // e-mails do Firebase (ex.: redefinir senha) em português
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

    async createUser({ name, email, password, slug, expiresAt, whatsapp = "", cnpj = "", responsavel = "" }) {
      email = email.trim().toLowerCase();
      slug = slugify(slug || name);
      if (!slug) throw new Error("Informe o endereço do catálogo.");
      const catRef = this._cat(slug);
      if ((await catRef.get()).exists) throw new Error("Esse endereço de catálogo já está em uso.");
      const uid = await this._newAuth(email, password);
      const profile = { name, email, role: "user", slug, expiresAt, active: true, createdAt: Date.now(), lastLogin: null, whatsapp, cnpj, responsavel };
      await this._users().doc(uid).set(profile);
      await catRef.set({ uid, slug, expiresAt, active: true, store: { ...emptyStore(name), whatsapp: String(whatsapp).replace(/\D/g, "") }, products: [], updatedAt: Date.now() });
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

    async sendReset(email) {
      // depois de criar a senha nova, o botão "Continuar" do Firebase volta para o login do catálogo
      const url = new URL("index.html", location.href).href;
      try { await this.auth.sendPasswordResetEmail(email, { url }); }
      catch (e) {
        if (/unauthorized-continue-uri|invalid-continue-uri/.test(e.code || "")) await this.auth.sendPasswordResetEmail(email);
        else throw e;
      }
    },

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

    async saveQuote(q) {
      await this._ready;
      const u = this.auth.currentUser;
      if (!u) throw new Error("Faça login novamente.");
      const ref = await this.db.collection("quotes").add({ ...q, createdBy: u.uid, createdAt: Date.now() });
      return ref.id;
    },
    async getQuote(id) {
      const s = await this.db.collection("quotes").doc(id).get();
      return s.exists ? s.data() : null;
    },
    async track(slug, delta) {
      const inc = firebase.firestore.FieldValue.increment;
      const day = dayKey();
      const data = { slug, day };
      if (delta.visits) data.visits = inc(delta.visits);
      STAT_MAPS.forEach((m) => {
        const e = Object.entries(delta[m] || {});
        if (e.length) data[m] = Object.fromEntries(e.map(([k, n]) => [k, inc(n)]));
      });
      await this.db.collection("stats").doc(`${slug}_${day}`).set(data, { merge: true });
    },
    async getStats(slug, days) {
      // lê dia a dia pelo id (sem consulta), em paralelo
      return Promise.all(lastDays(days).map(async (day) => {
        const s = await this.db.collection("stats").doc(`${slug}_${day}`).get();
        return s.exists ? s.data() : { slug, day, visits: 0 };
      }));
    },
    async seen(me, first) {
      await this._users().doc(me.uid).update({ lastSeen: Date.now() });
      if (first) {
        const inc = firebase.firestore.FieldValue.increment, day = dayKey();
        await this.db.collection("acessos").doc(day).set({ day, n: inc(1), u: { [me.uid]: inc(1) } }, { merge: true });
      }
    },
    async listAcessos(days) {
      const list = lastDays(days);
      const snap = await this.db.collection("acessos").where("day", ">=", list[0]).get();
      const by = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
      return list.map((day) => by[day] || { day, n: 0, u: {} });
    },
    async listAllStats(days) {
      const snap = await this.db.collection("stats").where("day", ">=", lastDays(days)[0]).limit(5000).get();
      return snap.docs.map((d) => d.data());
    },
    async createPedido(data) {
      await this._ready;
      const u = this.auth.currentUser;
      const ref = await this.db.collection("pedidos").add({ ...data, ...(u ? { uid: u.uid } : {}), status: "aguardando_pagamento", createdAt: Date.now() });
      return ref.id;
    },
    async pedidoPago(id) { await this.db.collection("pedidos").doc(id).update({ status: "pagamento_informado", paidAt: Date.now() }); },
    async listPedidos() {
      const snap = await this.db.collection("pedidos").orderBy("createdAt", "desc").limit(200).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    watchPedidos(cb, onError) {
      // tempo real: o Firestore avisa assim que um pedido é criado ou muda
      return this.db.collection("pedidos").orderBy("createdAt", "desc").limit(200)
        .onSnapshot((snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => onError && onError(e));
    },
    async updatePedido(id, patch) { await this.db.collection("pedidos").doc(id).update(patch); },
    async deletePedido(id) { await this.db.collection("pedidos").doc(id).delete(); },
    async listQuotes(owner) {
      // só os orçamentos da própria loja (ownerUid gravado na criação)
      const snap = await this.db.collection("quotes").where("ownerUid", "==", owner.uid).limit(300).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
      snap.docs.forEach((d) => { const c = d.data(); out[c.uid] = { products: (c.products || []).length, updatedAt: c.updatedAt, whatsapp: (c.store && c.store.whatsapp) || "" }; });
      return out;
    }
  };

  const impl = CFG.modo === "firebase" ? Firebase : Local;
  let initPromise = null;

  window.DB = {
    async watchPedidos(cb, onError) { await window.DB.init(); return impl.watchPedidos(cb, onError); },
    mode: CFG.modo === "firebase" ? "firebase" : "local",
    DAY, TEAM, ROLE_LABEL, accessStatus, slugify, hasLegacyPrices,
    init() { return (initPromise = initPromise || impl.init()); }
  };
  ["login", "logout", "current", "listUsers", "createUser", "updateUser", "deleteUser",
   "createMember", "listMembers", "updateMember", "deleteMember",
   "setMyWhatsapp", "saveQuote", "getQuote", "listQuotes", "track", "getStats", "createPedido", "pedidoPago", "listPedidos", "updatePedido", "deletePedido", "getMyCatalog", "saveMyCatalog", "getCatalogBySlug", "getPrices", "listCatalogStats", "sendReset", "seen", "listAcessos", "listAllStats"].forEach((fn) => {
    window.DB[fn] = async (...args) => {
      await window.DB.init();
      if (!impl[fn]) throw new Error("Função indisponível neste modo.");
      return impl[fn](...args);
    };
  });
})();
