(async () => {
  const { $, $$, esc, toast } = U;
  const me = await U.requireLogin();
  if (me) U.showAviso(document.getElementById("aviso-banner"), me);
  if (!me) return;
  if (me.role === "admin") { location.replace("admin.html"); return; }
  U.modeBanner();

  let cat = await DB.getMyCatalog(me);
  if (!cat) { toast("Catálogo não encontrado. Fale com o administrador.", "err"); return; }
  let store = { ...cat.store }, products = cat.products || [];
  var ajustes = null; // fator de preço (var: usado por funções que podem rodar antes desta linha)
  try { ajustes = await DB.getAjustes(me.slug); } catch { ajustes = null; }

  const link = `${new URL("loja.html", location.href).href}?loja=${encodeURIComponent(me.slug)}`;
  $("#me-email").textContent = me.email;
  $("#hello").textContent = `Olá, ${me.name.split(" ")[0]}!`;
  $("#open-catalog").href = link;
  $("#cat-link").value = link;
  $("#logout").onclick = (e) => U.logout(e.currentTarget);
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); } catch { $("#cat-link").select(); document.execCommand("copy"); }
    toast("Link do catálogo copiado (sem preços).");
    markShared();
  };
  $("#copy-link").onclick = copyLink;
  $("#head-copy").onclick = copyLink;
  $("#head-open").href = link;
  $("#share-wa").addEventListener("click", () => markShared());

  /* ---------- abas ---------- */
  const TABS = ["produtos", "loja", "fotos", "equipe", "procura", "orcamentos", "compartilhar"];
  function showTab(name, focus) {
    if (!TABS.includes(name)) name = "produtos";
    $$(".tabs-nav [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    $$(".tab-panel").forEach((p) => { p.hidden = p.dataset.panel !== name; });
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
    if (name === "orcamentos") loadQuotes();
    if (name === "procura") loadDash();
    if (focus) { const t = $(`.tab-panel[data-panel="${name}"] input:not([type=file]):not([readonly]), .tab-panel[data-panel="${name}"] button`); t && t.focus({ preventScroll: true }); }
  }
  $(".tabs-nav").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));
  showTab(location.hash.slice(1));

  /* ---------- primeiros passos ---------- */
  const OB_KEY = "cat_ob_" + me.uid;
  const obState = () => { try { return JSON.parse(localStorage.getItem(OB_KEY)) || {}; } catch { return {}; } };
  const obSet = (k, v) => { const s = obState(); s[k] = v; try { localStorage.setItem(OB_KEY, JSON.stringify(s)); } catch { /* ignore */ } };
  function markShared() { obSet("shared", true); renderOnboarding(); }
  function renderOnboarding() {
    if (typeof products === "undefined") return;
    const st = obState();
    const withPhoto = products.filter((p) => p.images?.length || p.imageUrl).length;
    const steps = [
      { done: products.length > 0, tab: "produtos", t: "Importe seus produtos", d: "Envie a planilha do Excel ou cadastre um a um." },
      { done: products.length > 0 && withPhoto >= Math.ceil(products.length / 2), tab: "fotos", t: "Ligue as fotos do Drive", d: "As fotos entram sozinhas pelo código." },
      { done: !!(store.whatsapp && (store.cover || store.about)), tab: "loja", t: "Personalize a loja", d: "Capa, frase e WhatsApp de contato." },
      { done: members.length > 0, tab: "equipe", t: "Crie a equipe", d: "Vendedores e representantes veem os preços." },
      { done: !!st.shared, tab: "compartilhar", t: "Compartilhe o link", d: "Envie o catálogo aos clientes." }
    ];
    const n = steps.filter((s) => s.done).length;
    const box = $("#onboarding");
    box.hidden = !!st.hidden || n === steps.length;
    $("#ob-progress").textContent = `${n} de ${steps.length} concluídos`;
    $("#ob-bar").style.width = `${(n / steps.length) * 100}%`;
    $("#ob-list").innerHTML = steps.map((s, i) => `<li class="${s.done ? "done" : ""}"><button data-tab="${s.tab}">
      <span class="ck" aria-hidden="true">${s.done ? "✓" : i + 1}</span><span><b>${s.t}</b><small>${s.d}</small></span>
      <span class="sr-only">${s.done ? "(concluído)" : "(pendente)"}</span></button></li>`).join("");
  }
  $("#ob-list").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { showTab(b.dataset.tab, true); $(".tabs-nav").scrollIntoView({ behavior: "smooth" }); } });
  $("#ob-hide").onclick = () => { obSet("hidden", true); renderOnboarding(); };

  /* ---------- acesso ---------- */
  function renderAccess() {
    const d = U.daysLeft(me.expiresAt);
    $("#acc-days").textContent = d == null ? "Sem limite" : `${d} dia${d === 1 ? "" : "s"}`;
    const soon = d != null && d <= 7;
    $("#acc-pill").innerHTML = `<span class="pill ${soon ? "expirando" : "ativo"}">${me.expiresAt ? "até " + U.date(me.expiresAt) : "Ativo"}</span>`;
    // aviso de renovação em destaque no topo do painel
    const st = U.renewState(me);
    if (st) {
      $("#renew-banner").hidden = false;
      $("#renew-banner").classList.toggle("urgent", d <= 2);
      $("#rb-title").textContent = d <= 0 ? "Seu plano venceu" : d === 1 ? "Seu plano vence amanhã" : `Seu plano vence em ${d} dias`;
      $("#rb-sub").textContent = `Renove até ${U.date(me.expiresAt)} para não perder tempo: seu catálogo e sua equipe saem do ar quando o plano vence. Fale com a gente no ${U.renewPhoneLabel()}.`;
      $("#rb-btn").href = U.renewLink(me);
    }
  }
  renderAccess();

  /* ---------- equipe: vendedores e representantes ---------- */
  let tmRole = "seller", members = [];
  $$("#tm-role [data-role]").forEach((b) => b.onclick = () => {
    tmRole = b.dataset.role;
    $$("#tm-role [data-role]").forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-checked", String(on)); });
  });
  $("#tm-gen").onclick = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    $("#tm-pass").value = Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => chars[n % chars.length]).join("");
  };
  async function loadTeam() {
    try { members = await DB.listMembers(me); } catch (e) { toast(e.message, "err"); members = []; }
    members.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    $("#tab-count-team").textContent = members.length || "";
    syncTeamContacts();
    renderOnboarding();
    $("#team-list").innerHTML = members.length ? members.map((m) => `
      <li data-uid="${esc(m.uid)}">
        <div><b>${esc(m.name)}</b> <span class="pill ${m.active === false ? "bloqueado" : "ativo"}">${DB.ROLE_LABEL[m.role]}${m.active === false ? " · bloqueado" : ""}</span>
          <div class="hint" style="margin:2px 0 0">${esc(m.email)} · ${m.whatsapp ? "WhatsApp " + esc(m.whatsapp) : "<span style='color:var(--warn)'>sem WhatsApp</span>"} · último login: ${U.dateTime(m.lastLogin)}</div></div>
        <div class="team-actions">
          <button class="btn sm" data-act="toggle">${m.active === false ? "Desbloquear" : "Bloquear"}</button>
          <button class="btn sm" data-act="wa">WhatsApp</button>
          <button class="btn sm" data-act="pass">Senha</button>
          <button class="btn sm danger" data-act="del" aria-label="Excluir ${esc(m.name)}">Excluir</button>
        </div>
      </li>`).join("") : `<li class="hint" style="justify-content:center">Nenhuma conta criada ainda.</li>`;
  }
  $("#team-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#tm-name").value.trim(), email = $("#tm-email").value.trim(), password = $("#tm-pass").value;
    const whatsapp = $("#tm-wa").value.replace(/\D/g, "");
    if (whatsapp && whatsapp.length < 10) return toast("WhatsApp incompleto: use DDD + número.", "err");
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return toast("Preencha nome e um e-mail válido.", "err");
    if (password.length < 6) return toast("A senha precisa ter pelo menos 6 caracteres.", "err");
    const btn = $("#tm-submit"); btn.disabled = true;
    try {
      await DB.createMember(me, { name, email, password, role: tmRole, whatsapp });
      toast(`${DB.ROLE_LABEL[tmRole]} criado. Envie o login: ${email.toLowerCase()}`);
      $("#tm-name").value = ""; $("#tm-email").value = ""; $("#tm-pass").value = ""; $("#tm-wa").value = "";
      await loadTeam();
    } catch (err) { toast(err.message, "err"); }
    btn.disabled = false;
  });
  $("#team-list").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const m = members.find((x) => x.uid === b.closest("li").dataset.uid); if (!m) return;
    try {
      if (b.dataset.act === "toggle") {
        await DB.updateMember(me, m.uid, { active: m.active === false });
        toast(m.active === false ? "Acesso liberado." : "Acesso bloqueado.");
      } else if (b.dataset.act === "del") {
        if (!(await U.ask({ title: `Excluir ${m.name}?`, text: "A pessoa perde o acesso ao catálogo e aos preços. Isso não pode ser desfeito.", ok: "Excluir conta", danger: true }))) return;
        await DB.deleteMember(me, m.uid); toast("Conta excluída.");
      } else if (b.dataset.act === "wa") {
        const v = await U.ask({ title: `WhatsApp de ${m.name}`, text: "Os orçamentos montados por essa pessoa chegam neste número.", ok: "Salvar", input: { value: m.whatsapp || "", placeholder: "11 99999-9999", inputmode: "tel" } });
        if (v === null) return;
        const n = v.replace(/\D/g, "");
        if (n && n.length < 10) return toast("WhatsApp incompleto: use DDD + número.", "err");
        await DB.updateMember(me, m.uid, { whatsapp: n });
        toast("WhatsApp atualizado.");
      } else if (b.dataset.act === "pass") {
        if (DB.mode === "firebase") {
          if (!(await U.ask({ title: "Redefinir senha", text: `Vamos enviar um e-mail para ${m.email} com o link para criar uma nova senha.`, ok: "Enviar e-mail" }))) return;
          await DB.sendReset(m.email); toast("E-mail de redefinição enviado."); return;
        }
        const p = await U.ask({ title: `Nova senha para ${m.name}`, text: "Mínimo de 6 caracteres.", ok: "Salvar senha", input: { type: "text" } });
        if (!p) return;
        await DB.updateMember(me, m.uid, { password: p }); toast("Senha alterada.");
        return;
      }
      await loadTeam();
    } catch (err) { toast(err.message, "err"); }
  });
  loadTeam();

  /* Equipe com WhatsApp aparece como opção no carrinho dos clientes */
  function syncTeamContacts() {
    const team = members.filter((m) => m.active !== false && m.whatsapp).map((m) => ({ name: m.name.split(" ")[0], whatsapp: m.whatsapp }));
    if (JSON.stringify(team) === JSON.stringify(store.team || [])) return;
    store.team = team;
    save();
  }

  async function save(msg) {
    try {
      cat = await DB.saveMyCatalog(me, { store, products });
      if (msg) toast(msg);
      renderOnboarding();
      return true;
    } catch (err) {
      toast(err.message, "err");
      if (/acesso/.test(err.message)) setTimeout(() => location.replace("index.html?expirado=1"), 2000);
      return false;
    }
  }
  // Catálogos antigos guardavam preços na parte pública: move para a área protegida.
  if (cat.legacy) save();

  /* ---------- loja e capa ---------- */
  const fill = () => {
    $("#s-name").value = store.name || "";
    $("#s-about").value = store.about || "";
    $("#s-wa").value = store.whatsapp || "";
    $("#s-ig").value = store.instagram || "";
    $("#s-accent").value = store.accent || "#ff6a36";
    $("#sellers").innerHTML = "";
    (store.sellers || []).forEach(addSellerRow);
    $("#drive-link").value = store.driveFolderId ? `https://drive.google.com/drive/folders/${store.driveFolderId}` : "";
    showCover();
    const wa = `Confira nosso catálogo: ${link}`;
    $("#share-wa").href = `https://wa.me/?text=${encodeURIComponent(wa)}`;
  };
  function addSellerRow(v = {}) {
    const row = document.createElement("div");
    row.className = "seller";
    row.innerHTML = `<input class="sl-name" maxlength="40" placeholder="Nome (ex.: Ana)" aria-label="Nome do vendedor">
      <input class="sl-wa" inputmode="tel" placeholder="11 99999-9999" aria-label="WhatsApp do vendedor">
      <button type="button" class="btn sm ghost danger" aria-label="Tirar vendedor">×</button>`;
    row.querySelector(".sl-name").value = v.name || "";
    row.querySelector(".sl-wa").value = v.whatsapp || "";
    row.querySelector("button").onclick = () => row.parentNode.removeChild(row);
    $("#sellers").appendChild(row);
  }
  $("#add-seller").onclick = () => { addSellerRow(); $("#sellers .seller:last-child .sl-name").focus(); };

  function showCover() {
    const img = $("#cover-img");
    img.hidden = !store.cover; $("#cover-text").hidden = !!store.cover; $("#cover-remove").hidden = !store.cover;
    if (store.cover) img.src = store.cover;
  }
  fill();

  const drop = $("#cover-drop"), file = $("#cover-file");
  drop.onclick = () => file.click();
  drop.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } };
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", (e) => e.dataTransfer.files[0] && setCover(e.dataTransfer.files[0]));
  file.onchange = () => file.files[0] && setCover(file.files[0]);
  async function setCover(f) {
    try {
      const prev = store.cover;
      store.cover = await U.compressImage(f, 1600, 0.78);
      showCover();
      if (!(await save("Capa atualizada!"))) { store.cover = prev; showCover(); }
    } catch (err) { toast(err.message, "err"); }
    file.value = "";
  }
  $("#cover-remove").onclick = async () => { store.cover = ""; showCover(); await save("Capa removida."); };

  /* ---------- logo / ícone da aba ---------- */
  function showLogo() {
    const has = !!store.logo;
    $("#logo-img").hidden = !has; $("#logo-text").hidden = has; $("#logo-remove").hidden = !has;
    if (has) $("#logo-img").src = store.logo;
    $("#tp-icon").style.backgroundImage = has ? `url("${store.logo}")` : "";
    $("#tp-icon").classList.toggle("empty", !has);
    $("#tp-title").textContent = $("#s-name").value.trim() || store.name || "Catálogo";
    U.setFavicon(store.logo); // o painel também mostra o ícone, para a loja ver como fica
  }
  showLogo();
  $("#s-name").addEventListener("input", showLogo);
  const logoFile = $("#logo-file");
  $("#logo-drop").onclick = () => logoFile.click();
  ["dragenter", "dragover"].forEach((ev) => $("#logo-drop").addEventListener(ev, (e) => { e.preventDefault(); $("#logo-drop").classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => $("#logo-drop").addEventListener(ev, (e) => { e.preventDefault(); $("#logo-drop").classList.remove("drag"); }));
  $("#logo-drop").addEventListener("drop", (e) => e.dataTransfer.files[0] && setLogo(e.dataTransfer.files[0]));
  logoFile.onchange = () => logoFile.files[0] && setLogo(logoFile.files[0]);
  async function setLogo(f) {
    const prev = store.logo;
    try {
      store.logo = await U.squareIcon(f, 192);
      showLogo();
      if (!(await save("Logo atualizado! Ele já aparece na aba do catálogo."))) { store.logo = prev; showLogo(); }
    } catch (err) { toast(err.message, "err"); }
    logoFile.value = "";
  }
  $("#logo-remove").onclick = async () => {
    store.logo = ""; showLogo();
    const l = document.querySelector('link[rel="icon"]'); if (l) l.href = "data:,";
    await save("Logo removido.");
  };

  $("#store-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    store.name = $("#s-name").value.trim();
    store.about = $("#s-about").value.trim();
    store.whatsapp = $("#s-wa").value.replace(/\D/g, "");
    store.instagram = $("#s-ig").value.trim().replace(/^@/, "");
    store.accent = $("#s-accent").value;
    if (store.whatsapp && store.whatsapp.length < 10) return toast("WhatsApp da loja incompleto: use DDD + número.", "err");
    if (await save("Dados da loja salvos!")) $("#store-dirty").hidden = true;
  });
  $("#store-form").addEventListener("input", (e) => { if (e.target.type !== "file") $("#store-dirty").hidden = false; });
  window.addEventListener("beforeunload", (e) => { if (!$("#store-dirty").hidden || !$("#min-dirty").hidden) { e.preventDefault(); e.returnValue = ""; } });

  $("#contacts-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const bad = U.$$("#sellers .sl-wa").some((i) => i.value.trim() && i.value.replace(/\D/g, "").length < 10);
    if (bad) return toast("Algum WhatsApp está incompleto: use DDD + número.", "err");
    store.sellers = U.$$("#sellers .seller").map((r) => ({
      name: r.querySelector(".sl-name").value.trim(),
      whatsapp: r.querySelector(".sl-wa").value.replace(/\D/g, "")
    })).filter((x) => x.whatsapp.length >= 10);
    await save("Contatos salvos!");
  });

  /* ---------- Google Drive ---------- */
  $("#drive-sync").onclick = async () => {
    const id = U.driveFolderId($("#drive-link").value);
    const status = $("#drive-status"), btn = $("#drive-sync");
    if (!id) return toast("Cole o link da pasta do Google Drive.", "err");
    if (!products.length) return toast("Importe os produtos antes de buscar as fotos.", "err");
    btn.disabled = true; status.textContent = "Lendo a pasta do Drive…";
    try {
      const files = await U.driveList(id);
      const r = U.matchImages(products, files);
      products = r.products; store.driveFolderId = id;
      status.textContent = `${files.length} fotos encontradas · ${r.matched} de ${products.length} produtos com foto.`;
      await save("Fotos ligadas aos produtos!");
      renderProducts();
    } catch (err) { status.textContent = ""; toast(err.message, "err"); }
    btn.disabled = false;
  };

  /* ---------- produtos ---------- */
  function renderProducts() {
    const q = $("#p-search").value.trim().toLowerCase(), f = $("#p-filter").value;
    const list = products.map((p, i) => ({ p, i })).filter(({ p }) => {
      if (f === "promo" && !U.discount(p) && !p.tagPromo) return false;
      if (f === "new" && !p.isNew) return false;
      if (f === "nophoto" && (p.images?.length || p.imageUrl)) return false;
      return !q || String(p.code).toLowerCase().includes(q) || String(p.name).toLowerCase().includes(q);
    });
    const withPhoto = products.filter((p) => p.images?.length || p.imageUrl).length;
    $("#prod-count").textContent = products.length ? `· ${products.length} itens · ${withPhoto} com foto` : "";
    $("#tab-count-prod").textContent = products.length || "";
    const empty = !products.length
      ? `<div class="empty-state"><h3>Seu catálogo ainda está vazio</h3>
          <p>Comece pela planilha: baixe o modelo, preencha no Excel e importe aqui.</p>
          <div class="actions"><button class="btn" data-empty="model">1. Baixar modelo</button><label class="btn primary" for="xls-file" style="margin:0;color:#111">2. Importar planilha</label></div></div>`
      : `<div class="empty-state"><h3>Nenhum produto encontrado</h3><p>Tente outro código ou nome.</p>
          <div class="actions"><button class="btn" data-empty="clear">Limpar busca</button></div></div>`;
    $("#products").innerHTML = list.length ? list.slice(0, 400).map(({ p, i }) => {
      const off = U.discount(p);
      return `<button class="p-mini" data-i="${i}" style="text-align:left;cursor:pointer;padding:0" aria-label="Editar ${esc(p.name || p.code)}">
        ${U.imgTag(p, 300, "thumb")}
        <span class="flags">${off ? `<span class="flag">-${off}%</span>` : p.tagPromo ? `<span class="flag">PROMO</span>` : ""}${p.isNew ? `<span class="flag new">NOVO</span>` : ""}</span>
        ${!(p.images?.length || p.imageUrl) ? `<span class="nophoto">sem foto</span>` : ""}
        <div class="info"><span class="code-row"><span class="code">${esc(p.code)}</span>${U.boxBadge(p, "sm")}</span><b>${esc(p.name || "Sem nome")}</b>${U.colorDots(p, 6, "sm")}
        <span>${off ? `<s class="code">${U.money(U.aplicaFator(p.price, ajustes))}</s> ${U.money(U.aplicaFator(p.promoPrice, ajustes))}` : U.money(U.aplicaFator(p.price, ajustes)) || "<span class='code'>sem preço</span>"}${U.fatorAtivo(ajustes) && p.price != null ? `<small class="fator-base">cadastrado ${U.money(off ? p.promoPrice : p.price)} · ${U.fatorTxt(ajustes.fator)}</small>` : ""}</span></div>
        <span class="edit" aria-hidden="true">Editar ✎</span>
      </button>`;
    }).join("") + (list.length > 400 ? `<p class="hint">Mostrando 400 de ${list.length}. Use a busca.</p>` : "") : empty;
    renderOnboarding();
    $("#cats").innerHTML = [...new Set(products.map((p) => p.category).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join("");
  }
  $("#p-search").addEventListener("input", renderProducts);
  $("#p-filter").addEventListener("change", renderProducts);
  renderProducts();

  /* Excel */
  let pending = null;
  const dlgImport = $("#dlg-import");
  $("#xls-file").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      pending = await U.readProductsFromExcel(f);
      if (!pending.length) throw new Error("Nenhuma linha com código encontrada.");
      $("#imp-info").textContent = `${pending.length} produtos encontrados em "${f.name}".`;
      if (!products.length) { applyImport("replace"); return; }
      dlgImport.showModal();
    } catch (err) { toast(err.message, "err"); }
  };
  dlgImport.addEventListener("close", () => {
    if (dlgImport.returnValue === "ok") applyImport(dlgImport.querySelector("input[name=imp-mode]:checked").value);
  });
  async function applyImport(mode) {
    const old = new Map(products.map((p) => [String(p.code), p]));
    const incoming = pending.map((p) => ({ ...p, images: old.get(String(p.code))?.images || [] }));
    if (mode === "replace") products = incoming;
    else {
      const byCode = new Map(products.map((p) => [String(p.code), p]));
      incoming.forEach((p) => byCode.set(String(p.code), { ...byCode.get(String(p.code)), ...p }));
      products = [...byCode.values()];
    }
    pending = null;
    if (store.driveFolderId && CATALOGO_CONFIG.googleApiKey) {
      try { products = U.matchImages(products, await U.driveList(store.driveFolderId)).products; } catch { /* segue sem fotos */ }
    }
    renderProducts();
    await save(`Planilha importada: ${products.length} produtos.`);
  }
  $("#xls-export").onclick = () => {
    if (!products.length) return toast("Nenhum produto para exportar.", "err");
    U.exportProductsToExcel(products, `produtos-${me.slug}.xlsx`).catch((e) => toast(e.message, "err"));
  };
  $("#xls-model").onclick = () => U.exportProductsToExcel([], "modelo-produtos.xlsx").catch((e) => toast(e.message, "err"));

  /* editar produto */
  const dlgProd = $("#dlg-prod");
  let editIndex = -1;
  const openProduct = (i) => {
    editIndex = i;
    const p = i >= 0 ? products[i] : { code: "", name: "", description: "", category: "", price: null, promoPrice: null, imageUrl: "", images: [] };
    $("#pe-title").textContent = i >= 0 ? "Editar produto" : "Novo produto";
    $("#pe-code").value = p.code; $("#pe-name").value = p.name; $("#pe-desc").value = p.description;
    $("#pe-cat").value = p.category;
    $("#pe-price").value = p.price != null ? String(p.price).replace(".", ",") : "";
    $("#pe-promo").value = p.promoPrice != null ? String(p.promoPrice).replace(".", ",") : "";
    fatorHints();
    $("#pe-img").value = p.imageUrl || "";
    $("#pe-box").value = p.boxQty || "";
    $("#pe-new").checked = !!p.isNew;
    $("#pe-tagpromo").checked = !!p.tagPromo;
    $("#pe-colors").value = (p.colors || []).join(", ");
    paintColors();
    $("#pe-drive").textContent = p.images?.length ? `${p.images.length} foto(s) do Drive ligada(s) a este código.` : "";
    $("#pe-delete").hidden = i < 0;
    dlgProd.showModal();
  };
  $("#products").addEventListener("click", (e) => {
    const em = e.target.closest("[data-empty]");
    if (em && em.dataset.empty === "model") return $("#xls-model").click();
    if (em && em.dataset.empty === "clear") { $("#p-search").value = ""; $("#p-filter").value = ""; return renderProducts(); }
    const b = e.target.closest("[data-i]"); if (b) openProduct(Number(b.dataset.i));
  });
  // valida antes de fechar a janela, para não perder o que foi digitado
  $("#prod-form").addEventListener("submit", (e) => {
    if (!e.submitter || e.submitter.value !== "save") return;
    const code = $("#pe-code").value.trim();
    let msg = "";
    if (!code) msg = "O código é obrigatório.";
    else if (products.some((p, i) => i !== editIndex && String(p.code) === code)) msg = "Já existe um produto com esse código.";
    else if ($("#pe-price").value.trim() && U.parseMoney($("#pe-price").value) == null) msg = "Preço inválido. Use, por exemplo, 89,90.";
    else if ($("#pe-promo").value.trim() && U.parseMoney($("#pe-promo").value) == null) msg = "Preço promocional inválido.";
    else if ($("#pe-box").value.trim() && U.parseBox($("#pe-box").value) == null) msg = "Quantidade por caixa inválida. Use só números, por exemplo 12.";
    if (msg) { e.preventDefault(); toast(msg, "err"); }
  });
  $("#add-product").onclick = () => openProduct(-1);
  dlgProd.addEventListener("close", async () => {
    const v = dlgProd.returnValue;
    if (v === "delete" && editIndex >= 0) {
      // exclui na hora e oferece "Desfazer" por alguns segundos
      const idx = editIndex, removed = products[idx];
      products.splice(idx, 1);
      renderProducts();
      if (!(await save())) return;
      U.toastAction(`"${removed.name || removed.code}" excluído.`, "Desfazer", async () => {
        if (products.some((p) => String(p.code) === String(removed.code))) return toast("Já existe outro produto com esse código.", "err");
        products.splice(Math.min(idx, products.length), 0, removed);
        renderProducts();
        await save("Produto restaurado.");
      });
      return;
    } else if (v === "save") {
      const code = $("#pe-code").value.trim();
      const p = {
        ...(editIndex >= 0 ? products[editIndex] : { images: [] }),
        ...(editIndex >= 0 && String(products[editIndex].code) !== code ? { images: [] } : {}),
        code, name: $("#pe-name").value.trim(), description: $("#pe-desc").value.trim(), category: $("#pe-cat").value.trim(),
        price: U.parseMoney($("#pe-price").value), promoPrice: U.parseMoney($("#pe-promo").value), imageUrl: $("#pe-img").value.trim(),
        boxQty: U.parseBox($("#pe-box").value),
        isNew: $("#pe-new").checked, tagPromo: $("#pe-tagpromo").checked,
        colors: U.parseColors($("#pe-colors").value)
      };
      if (editIndex >= 0) products[editIndex] = p; else products.unshift(p);
    } else return;
    renderProducts();
    await save("Produtos salvos!");
  });

  /* ---------- histórico de orçamentos ---------- */
  var quotes = null; // var: a aba pode ser aberta pelo endereço (#orcamentos) antes desta linha
  function qTotal(q) { return (q.items || []).reduce((t, it) => t + (it.unit != null ? it.unit * it.qty : 0), 0); }
  async function loadQuotes(force) {
    if (quotes && !force) return renderQuotes();
    try { quotes = await DB.listQuotes(me); }
    catch (e) { quotes = []; $("#qh-list").innerHTML = `<tr><td colspan="6" class="empty">Não foi possível carregar os orçamentos. ${DB.mode === "firebase" ? "Confira se as regras novas do Firestore foram publicadas." : ""}</td></tr>`; return; }
    quotes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    $("#tab-count-quotes").textContent = quotes.length || "";
    const sellers = [...new Set(quotes.map((q) => (q.seller && q.seller.name) || q.sellerName).filter(Boolean))].sort();
    $("#qh-seller").innerHTML = `<option value="">Todos os vendedores</option>` + sellers.map((n) => `<option>${esc(n)}</option>`).join("");
    renderQuotes();
  }
  function renderQuotes() {
    const term = $("#qh-search").value.trim().toLowerCase(), seller = $("#qh-seller").value, days = Number($("#qh-period").value);
    const since = days ? Date.now() - days * 86400000 : 0;
    const list = (quotes || []).filter((q) => {
      const sname = (q.seller && q.seller.name) || q.sellerName || "";
      if (seller && sname !== seller) return false;
      if (since && (q.createdAt || 0) < since) return false;
      return !term || [q.number, q.client, q.clientDoc, q.clientPhone, sname].some((v) => String(v || "").toLowerCase().includes(term));
    });
    const sum = list.reduce((t, q) => t + qTotal(q), 0);
    $("#qh-stats").innerHTML = `
      <div><small>Orçamentos</small><b>${list.length}</b></div>
      <div><small>Valor somado</small><b>${U.money(sum) || "R$ 0,00"}</b></div>
      <div><small>Ticket médio</small><b>${list.length ? U.money(sum / list.length) : "—"}</b></div>`;
    const base = new URL("orcamento.html", location.href).href;
    $("#qh-list").innerHTML = list.length ? list.map((q) => {
      const link = `${base}?id=${encodeURIComponent(q.id)}`;
      const phone = String(q.clientPhone || "").replace(/\D/g, "");
      const wa = phone ? `https://wa.me/55${phone}?text=${encodeURIComponent(`Olá! Segue o orçamento ${q.number} — ${store.name || ""}:\n${link}`)}` : "";
      const units = (q.items || []).reduce((t, it) => t + it.qty, 0);
      return `<tr>
        <td><b>${esc(q.number)}</b><div class="muted">${U.dateTime(q.createdAt)}</div></td>
        <td><b>${esc(q.client || "—")}</b><div class="muted">${esc([q.clientDoc, q.clientPhone].filter(Boolean).join(" · "))}</div></td>
        <td>${esc((q.seller && q.seller.name) || q.sellerName || "—")}<div class="muted">${esc((q.seller && q.seller.role) || "")}</div></td>
        <td>${(q.items || []).length}<div class="muted">${units} un</div></td>
        <td><b>${U.money(qTotal(q)) || "—"}</b></td>
        <td class="actions">
          <a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener">Abrir PDF</a>
          ${wa ? `<a class="btn sm wa" href="${esc(wa)}" target="_blank" rel="noopener">Enviar ao cliente</a>` : ""}
          <button class="btn sm ghost" data-copy="${esc(link)}">Copiar link</button>
        </td></tr>`;
    }).join("") : `<tr><td colspan="6" class="empty">${quotes && quotes.length ? "Nenhum orçamento com esses filtros." : "Nenhum orçamento ainda. Quando a equipe enviar um orçamento pelo catálogo, ele aparece aqui."}</td></tr>`;
  }
  ["#qh-search", "#qh-seller", "#qh-period"].forEach((s) => $(s).addEventListener("input", renderQuotes));
  $("#qh-list").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]"); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); toast("Link do orçamento copiado."); } catch { prompt("Copie o link:", b.dataset.copy); }
  });

  /* ---------- pedido mínimo ---------- */
  let minTipo = (store.minimo && store.minimo.tipo) || "valor";
  const minNum = () => { const v = $("#min-valor").value; return minTipo === "valor" ? U.parseMoney(v) : Math.floor(Number(String(v).replace(",", "."))) || null; };
  const minState = () => ({ ativo: $("#min-on").checked, tipo: minTipo, valor: minNum() || 0, msg: $("#min-msg").value.trim(), topo: $("#min-topo").checked, equipe: $("#min-equipe").checked });
  function minPaint() {
    const m = minState();
    $$("#min-tipo [data-t]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === minTipo)));
    $("#min-fields").disabled = !m.ativo;
    $("#min-fields").classList.toggle("off", !m.ativo);
    $("#min-valor-label").textContent = { valor: "Valor mínimo (R$)", caixas: "Mínimo de caixas", pecas: "Mínimo de peças", itens: "Mínimo de produtos diferentes" }[minTipo];
    $("#min-valor").placeholder = minTipo === "valor" ? "500,00" : "10";
    $("#min-valor").inputMode = minTipo === "valor" ? "decimal" : "numeric";
    $("#min-msg").placeholder = `Ex.: ${U.minimoTxt({ ...m, msg: "", valor: m.valor || (minTipo === "valor" ? 500 : 10) })}`;
    $("#min-note").textContent = minTipo === "valor"
      ? "Como o cliente não vê preços, o valor aparece como aviso para ele; quem é bloqueado pelo valor é a equipe ao montar o orçamento (se marcado abaixo)."
      : minTipo === "caixas" ? "Produtos sem quantidade por caixa contam 1 caixa por unidade do carrinho." : "";
    const demo = { ...m, valor: m.valor || (minTipo === "valor" ? 500 : 10) };
    const atual = minTipo === "valor" ? demo.valor * 0.6 : Math.max(1, Math.round(demo.valor * 0.6));
    const c = U.minimoCheck(demo, { valor: atual, valorOk: true, caixas: atual, pecas: atual, itens: atual });
    $("#min-prev").innerHTML = `<div class="mb"><div class="mb-top"><b>${esc(U.minimoTxt(demo))}</b><span>${U.minimoQtd(demo, atual)} de ${U.minimoQtd(demo, demo.valor)}</span></div>
      <div class="mb-bar"><i style="width:${c.pct}%"></i></div><small>Faltam <b>${U.minimoQtd(demo, c.falta)}</b> para enviar o pedido.</small></div>`;
  }
  function minLoad() {
    const m = store.minimo || {};
    $("#min-on").checked = !!m.ativo;
    $("#min-valor").value = m.valor ? (m.tipo === "valor" ? String(m.valor).replace(".", ",") : String(m.valor)) : "";
    $("#min-msg").value = m.msg || "";
    $("#min-topo").checked = m.topo !== false;
    $("#min-equipe").checked = !!m.equipe;
    minPaint();
  }
  $$("#min-tipo [data-t]").forEach((b) => b.addEventListener("click", () => { minTipo = b.dataset.t; $("#min-valor").value = ""; minPaint(); $("#min-dirty").hidden = false; $("#min-valor").focus(); }));
  $("#min-form").addEventListener("input", () => { minPaint(); $("#min-dirty").hidden = false; });
  $("#min-on").addEventListener("change", () => { minPaint(); $("#min-dirty").hidden = false; if ($("#min-on").checked) $("#min-valor").focus(); });
  $("#min-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = minState();
    if (m.ativo && !(m.valor > 0)) { $("#min-valor").focus(); return toast(minTipo === "valor" ? "Informe o valor mínimo. Ex.: 500,00" : "Informe a quantidade mínima.", "err"); }
    store.minimo = m;
    if (await save(m.ativo ? `Pedido mínimo salvo: ${U.minimoQtd(m, m.valor)}.` : "Pedido mínimo desligado.")) $("#min-dirty").hidden = true;
  });
  minLoad();

  /* ---------- fator de preço ---------- */
  function fatorHints() {
    [["#pe-price", "#pe-price-f"], ["#pe-promo", "#pe-promo-f"]].forEach(([inp, out]) => {
      const v = U.parseMoney($(inp).value);
      const on = U.fatorAtivo(ajustes) && v != null;
      $(out).hidden = !on;
      if (on) $(out).textContent = `No catálogo: ${U.money(U.aplicaFator(v, ajustes))} (${U.fatorTxt(ajustes.fator)})`;
    });
  }
  ["#pe-price", "#pe-promo"].forEach((s) => $(s).addEventListener("input", fatorHints));
  function paintFatorBtn() {
    const b = $("#fator-open");
    b.textContent = U.fatorAtivo(ajustes) ? `× Fator ${U.fatorTxt(ajustes.fator)} ligado` : "× Fator de preço";
    b.classList.toggle("on", U.fatorAtivo(ajustes));
  }
  paintFatorBtn();
  const dlgFator = $("#dlg-fator");
  let fatArred = "centavo";
  const fatValor = () => { const n = Number(String($("#fat-valor").value).replace(",", ".")); return n > 0 ? n : null; };
  function fatPreview() {
    const f = fatValor(), aj = { fator: f || 1, arred: fatArred };
    $$("#fat-quick [data-f]").forEach((b) => b.classList.toggle("on", Number(b.dataset.f) === f));
    $$("#fat-arred [data-a]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.a === fatArred)));
    $("#fat-pct").textContent = !f ? "Digite um número maior que zero. Ex.: 2 ou 2,5." : f === 1 ? "1× = sem fator: o catálogo mostra o preço cadastrado."
      : f > 1 ? `O preço no catálogo fica ${Math.round((f - 1) * 100)}% acima do cadastrado.` : `O preço no catálogo fica ${Math.round((1 - f) * 100)}% abaixo do cadastrado.`;
    const sample = products.filter((p) => p.price != null).slice(0, 4);
    $("#fat-prev").innerHTML = sample.length ? `<table><thead><tr><th>Produto</th><th class="num">Cadastrado</th><th class="num">No catálogo</th></tr></thead><tbody>${sample.map((p) => {
      const base = U.discount(p) ? p.promoPrice : p.price;
      return `<tr><td>${esc(p.name || p.code)}</td><td class="num">${U.money(base)}</td><td class="num"><b>${U.money(U.aplicaFator(base, aj))}</b></td></tr>`;
    }).join("")}</tbody></table>`
      : `<p class="hint">Exemplo: um produto de ${U.money(10)} fica ${U.money(U.aplicaFator(10, aj))}.</p>`;
    $("#fat-save").disabled = !f;
  }
  $("#fator-open").onclick = () => {
    $("#fat-valor").value = U.fatorAtivo(ajustes) ? String(ajustes.fator).replace(".", ",") : "";
    fatArred = (ajustes && ajustes.arred) || "centavo";
    $("#fat-off").hidden = !U.fatorAtivo(ajustes);
    fatPreview(); dlgFator.showModal(); setTimeout(() => $("#fat-valor").focus(), 50);
  };
  $("#fat-valor").addEventListener("input", fatPreview);
  $$("#fat-quick [data-f]").forEach((b) => b.addEventListener("click", () => { $("#fat-valor").value = b.dataset.f.replace(".", ","); fatPreview(); }));
  $$("#fat-arred [data-a]").forEach((b) => b.addEventListener("click", () => { fatArred = b.dataset.a; fatPreview(); }));
  $("#fat-cancel").onclick = () => dlgFator.close();
  async function saveFator(aj, msg) {
    try {
      await DB.saveAjustes(aj); ajustes = aj;
      dlgFator.close(); paintFatorBtn(); renderProducts(); toast(msg);
    } catch (e) { toast(e.message, "err"); }
  }
  $("#fator-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = fatValor(); if (!f) return;
    if (f > 20 && !confirm(`Multiplicar os preços por ${U.fatorTxt(f)}? Confira se é isso mesmo.`)) return;
    saveFator({ fator: f, arred: fatArred }, f === 1 ? "Fator desligado: o catálogo mostra o preço cadastrado." : `Pronto! O catálogo agora mostra os preços ${U.fatorTxt(f)}.`);
  });
  $("#fat-off").onclick = () => saveFator({ fator: 1, arred: "centavo" }, "Fator desligado: o catálogo mostra o preço cadastrado.");

  /* ---------- painel "Mais procurados" ---------- */
  var dashDays = 30, dashData = null, dashLimit = 10; // var: a aba pode abrir pelo endereço antes desta linha
  async function loadDash() {
    $("#dash-kpis").innerHTML = `<p class="hint">Carregando…</p>`;
    try { dashData = await DB.getStats(me.slug, dashDays || 30); }
    catch (e) {
      $("#dash-kpis").innerHTML = `<p class="hint">Não foi possível carregar. ${DB.mode === "firebase" ? "Confira se as regras novas do Firestore foram publicadas." : ""}</p>`;
      return;
    }
    renderDash();
  }
  function sumMap(days, key) {
    const out = {};
    days.forEach((d) => Object.entries(d[key] || {}).forEach(([k, n]) => { out[k] = (out[k] || 0) + n; }));
    return out;
  }
  const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
  const label = (k) => k.replace(/_/g, " ");
  function renderDash() {
    const days = dashData || [];
    const v = sumMap(days, "v"), c = sumMap(days, "c"), o = sumMap(days, "o");
    const visits = days.reduce((t, d) => t + (d.visits || 0), 0);
    const tot = (m) => Object.values(m).reduce((a, b) => a + b, 0);
    // metade anterior x metade recente, para indicar tendência
    const half = Math.floor(days.length / 2);
    const prev = days.slice(0, half).reduce((t, d) => t + (d.visits || 0), 0), recent = days.slice(half).reduce((t, d) => t + (d.visits || 0), 0);
    const trend = prev ? Math.round(((recent - prev) / prev) * 100) : null;
    $("#dash-kpis").innerHTML = [
      ["Visitas", visits, trend == null ? "" : `<span class="trend ${trend >= 0 ? "up" : "down"}">${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend)}% <small>vs. início do período</small></span>`],
      ["Produtos vistos", tot(v), ""],
      ["Adições ao carrinho", tot(c), ""],
      ["Itens em pedidos", tot(o), ""]
    ].map(([t, n, extra]) => `<div class="kpi"><small>${t}</small><b>${fmtN(n)}</b>${extra}</div>`).join("");

    // gráfico de colunas: visitas por dia (uma série, sem legenda; o título diz o que é)
    const max = Math.max(1, ...days.map((d) => d.visits || 0));
    const W = Math.max(300, Math.round($("#dash-chart").clientWidth || 720)), H = W < 500 ? 160 : 190, padL = 34, padB = 22, padT = 10;
    const bw = (W - padL) / days.length, barW = Math.min(24, Math.max(3, bw - 2));
    const nice = (m) => { const p = Math.pow(10, Math.floor(Math.log10(m))); return Math.ceil(m / p) * p; };
    const top = nice(max), y = (n) => padT + (H - padT - padB) * (1 - n / top);
    const ticks = [0, top / 2, top];
    const fmtDay = (k) => { const [yy, mm, dd] = k.split("-"); return `${dd}/${mm}`; };
    const every = Math.max(1, Math.ceil(days.length / Math.max(3, Math.floor((W - padL) / 64))));
    // rótulo do último dia só se não encostar no anterior
    const lastLabeled = Math.floor((days.length - 1) / every) * every;
    const showLabel = (i) => i % every === 0 || (i === days.length - 1 && days.length - 1 - lastLabeled >= Math.ceil(every * 0.75));
    $("#dash-chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Visitas por dia nos últimos ${days.length} dias. Total ${visits}.">
      ${ticks.map((t) => `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" class="tick" text-anchor="end">${fmtN(t)}</text>`).join("")}
      ${days.map((d, i) => {
        const n = d.visits || 0, x = padL + i * bw + (bw - barW) / 2, h = (H - padT - padB) * (n / top);
        const r = Math.min(4, h / 2, barW / 2);
        const path = h > 0 ? `M${x},${y(0)} V${y(n) + r} Q${x},${y(n)} ${x + r},${y(n)} H${x + barW - r} Q${x + barW},${y(n)} ${x + barW},${y(n) + r} V${y(0)} Z` : "";
        return `<g class="col" tabindex="0" data-tip="${fmtDay(d.day)}: ${fmtN(n)} ${n === 1 ? "visita" : "visitas"}">
          <rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}" class="hit"/>
          ${path ? `<path d="${path}" class="bar"/>` : ""}
          ${showLabel(i) ? `<text x="${x + barW / 2}" y="${H - 6}" class="tick" text-anchor="middle">${fmtDay(d.day)}</text>` : ""}
        </g>`;
      }).join("")}
    </svg><div class="tip" id="dash-tip" hidden></div>`;
    $("#dash-chart-table").innerHTML = `<table><thead><tr><th>Dia</th><th class="num">Visitas</th></tr></thead><tbody>${days.map((d) => `<tr><td>${fmtDay(d.day)}</td><td class="num">${fmtN(d.visits)}</td></tr>`).join("")}</tbody></table>`;

    // ranking de produtos
    const byKey = new Map(products.map((p) => [String(p.code).replace(/[.\/\[\]*`~#$]/g, "_").slice(0, 60), p]));
    const keys = [...new Set([...Object.keys(v), ...Object.keys(c), ...Object.keys(o)])];
    const sort = $("#dash-sort").value;
    const score = (k) => (v[k] || 0) + 2 * (c[k] || 0) + 3 * (o[k] || 0);
    const val = (k) => (sort === "score" ? score(k) : ({ v, c, o }[sort][k] || 0));
    const rows = keys.map((k) => ({ k, p: byKey.get(k), s: val(k) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s);
    const best = rows.length ? rows[0].s : 1;
    $("#dash-products").innerHTML = rows.length ? rows.slice(0, dashLimit).map((r, i) => {
      const p = r.p || { code: r.k, name: "(produto removido)", images: [] };
      return `<tr>
        <td class="pos">${i + 1}</td>
        <td><div class="prod">${U.imgTag(p, 120, "th")}<div><b>${esc(p.name || "Produto")}</b><small>Cód. ${esc(p.code)}${U.tagText(p) ? " · " + esc(U.tagText(p)) : ""}</small></div></div></td>
        <td class="num" data-label="Vistos">${fmtN(v[r.k])}</td><td class="num" data-label="No carrinho">${fmtN(c[r.k])}</td><td class="num" data-label="Pedidos">${fmtN(o[r.k])}</td>
        <td><div class="meter" title="${fmtN(r.s)}"><i style="width:${Math.max(4, (r.s / best) * 100)}%"></i></div></td>
      </tr>`;
    }).join("") : `<tr><td colspan="6" class="empty">Ainda não há dados neste período. Compartilhe o link do catálogo e os números aparecem aqui.</td></tr>`;
    $("#dash-more").hidden = rows.length <= dashLimit;

    const mini = (m, el, empty) => {
      const list = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const top1 = list.length ? list[0][1] : 1;
      $(el).innerHTML = list.length ? list.map(([k, n]) => `<li><span>${esc(label(k))}</span><div class="meter"><i style="width:${Math.max(6, (n / top1) * 100)}%"></i></div><b>${fmtN(n)}</b></li>`).join("") : `<li class="none">${empty}</li>`;
    };
    mini(sumMap(days, "s"), "#dash-search", "Nenhuma busca ainda.");
    mini(sumMap(days, "sz"), "#dash-miss", "Ótimo: tudo que buscaram foi encontrado.");
    // categorias: mostra o nome original
    const catNames = new Map(products.map((p) => p.category).filter(Boolean).map((c) => [c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40), c]));
    const cats = {}; Object.entries(sumMap(days, "cat")).forEach(([k, n]) => { cats[catNames.get(k) || k] = n; });
    mini(cats, "#dash-cats", "Nenhuma categoria aberta ainda.");
  }
  // tooltip das colunas (mouse e teclado)
  $("#dash-chart").addEventListener("pointerover", (e) => showTip(e.target.closest(".col")));
  $("#dash-chart").addEventListener("focusin", (e) => showTip(e.target.closest(".col")));
  $("#dash-chart").addEventListener("pointerleave", () => { const t = $("#dash-tip"); if (t) t.hidden = true; });
  function showTip(g) {
    const t = $("#dash-tip"); if (!t || !g) return;
    const box = $("#dash-chart").getBoundingClientRect(), r = g.querySelector(".hit").getBoundingClientRect();
    t.textContent = g.dataset.tip; t.hidden = false;
    t.style.left = `${Math.min(box.width - 140, Math.max(0, r.left - box.left + r.width / 2 - 70))}px`;
  }
  $$("#dash-period [data-days]").forEach((b) => b.addEventListener("click", () => {
    dashDays = Number(b.dataset.days);
    $$("#dash-period [data-days]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    loadDash();
  }));
  $("#dash-sort").addEventListener("change", () => { dashLimit = 10; renderDash(); });
  let dashResize;
  addEventListener("resize", () => { clearTimeout(dashResize); dashResize = setTimeout(() => { if (dashData && !$('[data-panel="procura"]').hidden) renderDash(); }, 200); });
  $("#dash-more").addEventListener("click", () => { dashLimit += 20; renderDash(); });

  /* ---------- renovação do plano por Pix ---------- */
  const dlgPix = $("#dlg-pix");
  let pixTx = null;
  let renewPlan = null;
  async function showRenewPay(plano) {
    renewPlan = plano;
    pixTx = Pix.newTxid("RN");
    const novo = Math.max(Date.now(), me.expiresAt || 0) + plano.dias * DB.DAY;
    $("#pix-sub").textContent = `Plano ${plano.nome} · ${Pix.money(plano.valor)} · +${plano.dias} dias (acesso até ${U.date(novo)} depois da liberação).`;
    const code = await Pix.mountPay($("#pix-area"), { valor: plano.valor, txid: pixTx, descricao: `Renovacao ${me.slug}` });
    $("#pix-paid").hidden = !code;
    $("#pix-paid").textContent = "✓ Já paguei";
  }
  U.$$("[data-renew-pix]").forEach((b) => b.addEventListener("click", () => {
    dlgPix.showModal();
    Pix.planPicker($("#pix-plans"), showRenewPay);
  }));
  // confirma antes de registrar, para ninguém avisar sem ter pago
  dlgPix.querySelector("form").addEventListener("submit", async (e) => {
    if (!e.submitter || e.submitter.value !== "paid") return;
    e.preventDefault();
    const plano = renewPlan || Pix.cfg().plano;
    const ok = await U.ask({ title: "Você já concluiu o Pix?", text: `Confirme que o pagamento de ${Pix.money(plano.valor)} foi concluído no app do seu banco.`, ok: "Sim, já paguei", cancel: "Ainda não" });
    if (ok) dlgPix.close("paid");
  });
  dlgPix.addEventListener("close", async () => {
    if (dlgPix.returnValue !== "paid" || !pixTx) return;
    const plano = renewPlan || Pix.cfg().plano;
    try {
      const id = await DB.createPedido({ tipo: "renovacao", loja: store.name || me.name, slug: me.slug, responsavel: me.responsavel || me.name,
        email: me.email, whatsapp: store.whatsapp || me.whatsapp || "", cnpj: me.cnpj || "", plano: plano.nome, valor: plano.valor, dias: plano.dias, txid: pixTx });
      await DB.pedidoPago(id);
      const text = [`Olá! Paguei a renovação do *Catálogo Online* por Pix. Segue o comprovante.`, "",
        `Loja: ${store.name || me.name}`, `E-mail: ${me.email}`, `Valor: ${Pix.money(plano.valor)}`, `Pedido: ${pixTx}`].join("\n");
      const go = await U.ask({ title: "Pagamento informado!", text: "Assim que confirmarmos o Pix, seu acesso é renovado. Envie o comprovante pelo WhatsApp para agilizar.", ok: "Enviar comprovante", cancel: "Depois" });
      if (go) window.open(`https://wa.me/${U.renewPhone()}?text=${encodeURIComponent(text)}`, "_blank");
    } catch (err) { toast("Não foi possível registrar agora. Envie o comprovante pelo WhatsApp.", "err"); }
    pixTx = null;
  });

  /* ---------- cores do produto no editor ---------- */
  function paintColors() {
    const cs = U.parseColors($("#pe-colors").value);
    const keys = cs.map((c) => c.toLowerCase());
    $("#pe-colors-preview").innerHTML = cs.length ? cs.map((c) => `<span class="cp-item">${U.swatch(c)}${esc(c)}${U.colorHex(c) ? "" : ` <small title="Cor não reconhecida: aparece com listras">?</small>`}</span>`).join("") : "";
    $("#pe-colors-quick").innerHTML = U.COMMON_COLORS.map((c) => `<button type="button" data-color="${esc(c)}" aria-pressed="${keys.includes(c.toLowerCase())}">${U.swatch(c)}${esc(c)}</button>`).join("");
  }
  $("#pe-colors").addEventListener("input", paintColors);
  $("#pe-colors-quick").addEventListener("click", (e) => {
    const b = e.target.closest("[data-color]"); if (!b) return;
    const cs = U.parseColors($("#pe-colors").value), c = b.dataset.color;
    const i = cs.findIndex((x) => x.toLowerCase() === c.toLowerCase());
    if (i >= 0) cs.splice(i, 1); else cs.push(c);
    $("#pe-colors").value = cs.join(", ");
    paintColors();
  });
})();
