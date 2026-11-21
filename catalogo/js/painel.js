(async () => {
  const { $, $$, esc, toast } = U;
  const me = await U.requireLogin();
  if (!me) return;
  if (me.role === "admin") { location.replace("admin.html"); return; }
  U.modeBanner();

  let cat = await DB.getMyCatalog(me);
  if (!cat) { toast("Catálogo não encontrado. Fale com o administrador.", "err"); return; }
  let store = { ...cat.store }, products = cat.products || [];

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
  const TABS = ["produtos", "loja", "fotos", "equipe", "orcamentos", "compartilhar"];
  function showTab(name, focus) {
    if (!TABS.includes(name)) name = "produtos";
    $$(".tabs-nav [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    $$(".tab-panel").forEach((p) => { p.hidden = p.dataset.panel !== name; });
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
    if (name === "orcamentos") loadQuotes();
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
  window.addEventListener("beforeunload", (e) => { if (!$("#store-dirty").hidden) { e.preventDefault(); e.returnValue = ""; } });

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
        <div class="info"><span class="code-row"><span class="code">${esc(p.code)}</span>${U.boxBadge(p, "sm")}</span><b>${esc(p.name || "Sem nome")}</b>
        <span>${off ? `<s class="code">${U.money(p.price)}</s> ${U.money(p.promoPrice)}` : U.money(p.price) || "<span class='code'>sem preço</span>"}</span></div>
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
    $("#pe-img").value = p.imageUrl || "";
    $("#pe-box").value = p.boxQty || "";
    $("#pe-new").checked = !!p.isNew;
    $("#pe-tagpromo").checked = !!p.tagPromo;
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
        isNew: $("#pe-new").checked, tagPromo: $("#pe-tagpromo").checked
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
})();
