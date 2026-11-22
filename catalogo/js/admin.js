(async () => {
  const { $, $$, esc, toast } = U;
  const me = await U.requireLogin("admin");
  if (!me) return;
  U.modeBanner();
  $("#me-email").textContent = me.email;
  const hour = new Date().getHours();
  $("#hello").textContent = `${hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"}${me.name && me.name !== "Administrador" ? ", " + me.name.split(" ")[0] : ""}!`;
  $("#logout").onclick = (e) => U.logout(e.currentTarget);

  const base = new URL("loja.html", location.href).href;
  const catalogUrl = (slug) => `${base}?loja=${encodeURIComponent(slug)}`;
  let users = [], stats = {}, teamCount = {};

  const situation = (u) => {
    const st = DB.accessStatus(u);
    if (st === "ativo" && u.expiresAt && U.daysLeft(u.expiresAt) <= 7) return "expirando";
    return st;
  };

  /* ---------------- criar usuário ---------------- */
  let chosenDays = 30, slugTouched = false;
  const nameEl = $("#nu-name"), slugEl = $("#nu-slug"), untilEl = $("#nu-until");
  const updateSlugPreview = () => {
    const s = DB.slugify(slugEl.value);
    $("#slug-preview").textContent = s ? catalogUrl(s) : "";
  };
  nameEl.addEventListener("input", () => { if (!slugTouched) { slugEl.value = DB.slugify(nameEl.value); updateSlugPreview(); } });
  slugEl.addEventListener("input", () => { slugTouched = true; updateSlugPreview(); });
  slugEl.addEventListener("blur", () => { slugEl.value = DB.slugify(slugEl.value); updateSlugPreview(); });

  $("#gen-pass").onclick = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const arr = crypto.getRandomValues(new Uint32Array(10));
    $("#nu-pass").value = Array.from(arr, (n) => chars[n % chars.length]).join("");
  };

  $$("#nu-quick button").forEach((b) => b.onclick = () => {
    $$("#nu-quick button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on"); chosenDays = Number(b.dataset.days); untilEl.value = "";
  });
  untilEl.addEventListener("change", () => { if (untilEl.value) $$("#nu-quick button").forEach((x) => x.classList.remove("on")); });

  $("#new-user").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameEl.value.trim(), email = $("#nu-email").value.trim(), password = $("#nu-pass").value;
    if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) return toast("Preencha nome e um e-mail válido.", "err");
    if (password.length < 6) return toast("A senha precisa ter pelo menos 6 caracteres.", "err");
    let expiresAt = null;
    if (untilEl.value) expiresAt = U.endOfDay(untilEl.value);
    else if (chosenDays > 0) expiresAt = Date.now() + chosenDays * DB.DAY;
    if (expiresAt && expiresAt < Date.now()) return toast("A data final já passou.", "err");

    const btn = $("#nu-submit"); btn.disabled = true;
    try {
      const u = await DB.createUser({ name, email, password, slug: slugEl.value, expiresAt });
      toast(`Usuário criado. Envie o login: ${u.email}`);
      e.target.reset(); slugTouched = false; updateSlugPreview();
      $("#dlg-new").close(); showTab("lojas");
      $$("#nu-quick button").forEach((x) => x.classList.toggle("on", x.dataset.days === "30")); chosenDays = 30;
      await load();
    } catch (err) { toast(err.message, "err"); }
    btn.disabled = false;
  });

  const dlgNew = $("#dlg-new");
  $$("[data-open-new]").forEach((b) => b.addEventListener("click", () => { dlgNew.showModal(); setTimeout(() => nameEl.focus(), 50); }));
  $("#new-close").onclick = () => dlgNew.close();
  dlgNew.addEventListener("click", (e) => { if (e.target === dlgNew) dlgNew.close(); });

  /* ---------------- abas ---------------- */
  const TABS = ["inicio", "pedidos", "lojas", "acessos"];
  function showTab(name) {
    if (!TABS.includes(name)) name = "inicio";
    $$(".tabs-nav [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    $$(".tab-panel").forEach((p) => { p.hidden = p.dataset.panel !== name; });
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
    if (name === "acessos" && typeof renderAcessos === "function") setTimeout(renderAcessos, 0);
  }
  $(".tabs-nav").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-goto]"); if (b) { showTab(b.dataset.goto); scrollTo({ top: 0, behavior: "smooth" }); } });
  addEventListener("hashchange", () => showTab(location.hash.slice(1)));
  showTab(location.hash.slice(1));

  /* ---------------- lista ---------------- */
  async function load() {
    try {
      [users, stats] = await Promise.all([DB.listUsers(), DB.listCatalogStats()]);
    } catch (e) { toast(e.message, "err"); return; }
    // Vendedores e representantes são geridos por cada loja; aqui aparecem só como contagem.
    teamCount = {};
    users.filter((u) => DB.TEAM.includes(u.role)).forEach((u) => { teamCount[u.ownerUid] = (teamCount[u.ownerUid] || 0) + 1; });
    users = users.filter((u) => u.role === "user");
    users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const clients = users;
    const sits = clients.map(situation);
    $("#st-total").textContent = clients.length;
    $("#st-active").textContent = sits.filter((s) => s === "ativo" || s === "expirando").length;
    $("#st-soon").textContent = sits.filter((s) => s === "expirando").length;
    $("#st-off").textContent = sits.filter((s) => s === "expirado" || s === "bloqueado").length;
    $("#tb-lojas").textContent = clients.length || "";
    render(); renderHome();
  }

  /* ---------------- início: o que fazer agora ---------------- */
  const lastAccess = (u) => Math.max(u.lastSeen || 0, u.lastLogin || 0);
  const isOnline = (u) => u.lastSeen && Date.now() - u.lastSeen < 5 * 60000;
  function renderHome() {
    const paid = (typeof pedidos !== "undefined" ? pedidos : []).filter((p) => p.status === "pagamento_informado");
    const waiting = (typeof pedidos !== "undefined" ? pedidos : []).filter((p) => p.status === "aguardando_pagamento");
    const soon = users.filter((u) => situation(u) === "expirando").sort((a, b) => a.expiresAt - b.expiresAt);
    const expired = users.filter((u) => situation(u) === "expirado");
    const never = users.filter((u) => situation(u) !== "bloqueado" && !lastAccess(u) && Date.now() - (u.createdAt || 0) > 2 * DB.DAY);
    const items = [];
    paid.forEach((p) => items.push(`<li class="t-money"><span class="t-ic" aria-hidden="true">💰</span><div><b>Conferir o Pix de ${esc(p.loja)}</b><small>${p.tipo === "renovacao" ? "Renovação" : "Novo cadastro"} · ${Pix.money(p.valor || 0)} · informado ${U.dateTime(p.paidAt || p.createdAt)}</small></div><button class="btn sm primary" data-goto="pedidos">Liberar</button></li>`));
    soon.forEach((u) => items.push(`<li class="t-warn" data-uid="${esc(u.uid)}"><span class="t-ic" aria-hidden="true">⏳</span><div><b>${esc(u.name)} vence ${U.daysLeft(u.expiresAt) <= 1 ? "amanhã" : `em ${U.daysLeft(u.expiresAt)} dias`}</b><small>Até ${U.date(u.expiresAt)}. Mande o aviso de renovação.</small></div><button class="btn sm" data-act="remind">Avisar</button></li>`));
    expired.forEach((u) => items.push(`<li class="t-bad" data-uid="${esc(u.uid)}"><span class="t-ic" aria-hidden="true">⛔</span><div><b>${esc(u.name)} está vencido</b><small>Venceu em ${U.date(u.expiresAt)}. O catálogo está fora do ar.</small></div><button class="btn sm" data-act="remind">Avisar</button></li>`));
    never.slice(0, 3).forEach((u) => items.push(`<li data-uid="${esc(u.uid)}"><span class="t-ic" aria-hidden="true">👋</span><div><b>${esc(u.name)} ainda não entrou</b><small>Conta criada em ${U.date(u.createdAt)}. Vale ajudar no primeiro acesso.</small></div>${stats[u.uid] && stats[u.uid].whatsapp ? `<a class="btn sm wa" target="_blank" rel="noopener" href="https://wa.me/55${esc(String(stats[u.uid].whatsapp).replace(/\D/g, ""))}">WhatsApp</a>` : ""}</li>`));
    $("#todo").innerHTML = items.length ? items.join("") : `<li class="t-ok"><span class="t-ic" aria-hidden="true">✅</span><div><b>Tudo em dia!</b><small>Nenhum pagamento para conferir e nenhuma loja vencendo.</small></div></li>`;

    const parts = [];
    if (paid.length) parts.push(`<b class="hl">${paid.length} ${paid.length === 1 ? "pagamento" : "pagamentos"} para conferir</b>`);
    if (soon.length) parts.push(`${soon.length} ${soon.length === 1 ? "loja vence" : "lojas vencem"} esta semana`);
    if (waiting.length) parts.push(`${waiting.length} aguardando Pix`);
    const online = ((acData && acData.us) || users).filter((u) => u.role !== "admin" && isOnline(u)).length;
    if (online) parts.push(`${online} online agora`);
    $("#today-sum").innerHTML = parts.length ? parts.join(" · ") : "Tudo em dia por aqui. 👌";
    $("#tb-ped").textContent = paid.length || "";

    $("#home-recent").innerHTML = users.slice(0, 5).map((u) => {
      const sit = situation(u);
      const labels = { ativo: "Ativa", expirando: "Vence logo", expirado: "Vencida", bloqueado: "Bloqueada" };
      return `<li><span class="av" aria-hidden="true">${esc((u.name || "?").charAt(0).toUpperCase())}</span><div><b>${esc(u.name)}</b><small>${u.createdAt ? `Criada em ${U.date(u.createdAt)} · ` : ""}/${esc(u.slug || "")}</small></div><span class="pill ${sit}">${labels[sit]}</span></li>`;
    }).join("") || `<li class="none">Nenhuma loja ainda. Clique em <b>+ Nova loja</b> para começar.</li>`;
  }
  $("#todo").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const u = users.find((x) => x.uid === b.closest("li").dataset.uid); if (u && b.dataset.act === "remind") openRemind(u);
  });

  function accessCell(u) {
    if (u.role === "admin") return `<span class="pill admin">Administrador</span>`;
    const sit = situation(u);
    const labels = { ativo: "Ativo", expirando: "Vence logo", expirado: "Vencido", bloqueado: "Bloqueado" };
    let detail = "Sem limite de tempo", bar = "";
    if (u.expiresAt) {
      const d = U.daysLeft(u.expiresAt);
      detail = d > 0 ? `${d} dia${d > 1 ? "s" : ""} restante${d > 1 ? "s" : ""} · até ${U.date(u.expiresAt)}` : `Venceu em ${U.date(u.expiresAt)}`;
      const total = Math.max(1, u.expiresAt - (u.createdAt || u.expiresAt));
      const pct = Math.max(0, Math.min(100, ((u.expiresAt - Date.now()) / total) * 100));
      const color = sit === "expirando" ? "var(--warn)" : sit === "ativo" ? "var(--ok)" : "var(--bad)";
      bar = `<div class="bar"><i style="width:${pct}%;background:${color}"></i></div>`;
    }
    return `<span class="pill ${sit}">${labels[sit]}</span><div class="muted">${detail}</div>${bar}`;
  }

  function render() {
    const q = $("#search").value.trim().toLowerCase(), f = $("#filter").value;
    const list = users.filter((u) => {
      if (f) {
        if (u.role === "admin") return false;
        const sit = situation(u);
        const ok = f === "ativos" ? (sit === "ativo" || sit === "expirando")
          : f === "off" ? (sit === "expirado" || sit === "bloqueado") : sit === f;
        if (!ok) return false;
      }
      return !q || [u.name, u.email, u.slug].some((v) => String(v || "").toLowerCase().includes(q));
    });
    $("#users").innerHTML = list.length ? list.map((u) => `
      <tr data-uid="${esc(u.uid)}">
        <td><b>${esc(u.name)}</b><div class="muted">${esc(u.email)}</div></td>
        <td>${accessCell(u)}</td>
        <td>${u.slug ? `<a href="${esc(catalogUrl(u.slug))}" target="_blank" rel="noopener">/${esc(u.slug)}</a><div class="muted">${stats[u.uid] ? stats[u.uid].products : 0} produtos${teamCount[u.uid] ? ` · equipe: ${teamCount[u.uid]}` : ""}</div>` : "—"}</td>
        <td class="muted">${isOnline(u) ? `<span class="online-tag">● online agora</span>` : lastAccess(u) ? U.dateTime(lastAccess(u)) : "nunca entrou"}</td>
        <td class="actions">
          ${U.renewState(u) && u.active !== false ? `<button class="btn sm remind" data-act="remind">Avisar ⏳</button>` : `<button class="btn sm" data-act="time">+ Tempo</button>`}
          <details class="more">
            <summary class="btn sm" aria-label="Mais ações para ${esc(u.name)}">⋯</summary>
            <div class="more-menu" role="menu">
              <button type="button" role="menuitem" data-act="time">⏱ Tempo de acesso</button>
              <a role="menuitem" href="${esc(catalogUrl(u.slug))}" target="_blank" rel="noopener">↗ Abrir catálogo</a>
              <button type="button" role="menuitem" data-act="copy">🔗 Copiar link do catálogo</button>
              <button type="button" role="menuitem" data-act="pass">🔑 ${DB.mode === "firebase" ? "Enviar redefinição de senha" : "Trocar senha"}</button>
              <button type="button" role="menuitem" data-act="toggle">${u.active === false ? "🔓 Desbloquear" : "🔒 Bloquear"}</button>
              <button type="button" role="menuitem" class="danger" data-act="del">🗑 Excluir loja</button>
            </div>
          </details>
        </td>
      </tr>`).join("") : `<tr><td colspan="5" class="empty">${users.length ? "Nenhuma loja com esses filtros." : "Nenhuma loja ainda. Clique em <b>+ Nova loja</b> para criar a primeira."}</td></tr>`;
  }
  document.addEventListener("click", (e) => { $$("details.more[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; }); });
  // o menu "⋯" abre por cima de tudo (a tabela tem rolagem e cortaria o menu)
  $("#users").addEventListener("toggle", (e) => {
    const d = e.target; if (!d.matches || !d.matches("details.more") || !d.open) return;
    $$("details.more[open]").forEach((x) => { if (x !== d) x.open = false; });
    const m = d.querySelector(".more-menu"), r = d.querySelector("summary").getBoundingClientRect();
    const w = 240, h = m.offsetHeight || 280;
    m.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.right - w))}px`;
    m.style.top = `${r.bottom + 6 + h > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6}px`;
  }, true);
  addEventListener("scroll", () => $$("details.more[open]").forEach((d) => { d.open = false; }), { passive: true });
  $("#search").addEventListener("input", render);
  $("#filter").addEventListener("change", render);

  $("#users").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]"); if (!btn) return;
    const u = users.find((x) => x.uid === btn.closest("tr").dataset.uid); if (!u) return;
    const act = btn.dataset.act;
    const menu = btn.closest("details.more"); if (menu) menu.open = false;
    try {
      if (act === "copy") { try { await navigator.clipboard.writeText(catalogUrl(u.slug)); toast("Link do catálogo copiado."); } catch { prompt("Copie o link:", catalogUrl(u.slug)); } return; }
      if (act === "time") return openTime(u);
      if (act === "remind") return openRemind(u);
      if (act === "pass") return openPass(u);
      if (act === "toggle") {
        if (u.active !== false && !(await U.ask({ title: `Bloquear ${u.name}?`, text: "O catálogo sai do ar e a loja e a equipe não conseguem entrar até você desbloquear.", ok: "Bloquear", danger: true }))) return;
        await DB.updateUser(u.uid, { active: u.active === false });
        toast(u.active === false ? "Acesso desbloqueado." : "Acesso bloqueado. O catálogo saiu do ar.");
      }
      if (act === "del") {
        if (!(await U.ask({ title: `Excluir ${u.name}?`, text: "O catálogo, os produtos, os preços e a equipe desta loja serão apagados. Isso não pode ser desfeito.", ok: "Excluir tudo", danger: true }))) return;
        await DB.deleteUser(u.uid); toast("Usuário excluído.");
      }
      await load();
    } catch (err) { toast(err.message, "err"); }
  });

  /* ---------------- tempo de acesso ---------------- */
  const dlgTime = $("#dlg-time");
  let editing = null, newExpiry;
  const previewTime = () => {
    $("#time-preview").textContent = newExpiry === undefined ? "" :
      newExpiry === null ? "Novo acesso: sem limite de tempo." : `Novo acesso: até ${U.date(newExpiry)} (${U.daysLeft(newExpiry)} dias).`;
  };
  function openTime(u) {
    editing = u; newExpiry = undefined;
    $("#dlg-time-title").textContent = `Tempo de acesso — ${u.name}`;
    $("#time-current").textContent = u.expiresAt ? `Atual: até ${U.date(u.expiresAt)}` : "Atual: sem limite";
    $("#time-date").value = U.inputDate(u.expiresAt);
    $$("#time-quick button").forEach((x) => x.classList.remove("on"));
    previewTime(); dlgTime.showModal();
  }
  $$("#time-quick button").forEach((b) => b.onclick = () => {
    $$("#time-quick button").forEach((x) => x.classList.remove("on")); b.classList.add("on");
    const add = Number(b.dataset.add);
    if (!add) newExpiry = null;
    else {
      const from = Math.max(Date.now(), editing.expiresAt || 0);
      newExpiry = from + add * DB.DAY;
    }
    $("#time-date").value = U.inputDate(newExpiry);
    previewTime();
  });
  $("#time-date").addEventListener("change", (e) => {
    $$("#time-quick button").forEach((x) => x.classList.remove("on"));
    newExpiry = e.target.value ? U.endOfDay(e.target.value) : null; previewTime();
  });
  dlgTime.addEventListener("close", async () => {
    if (dlgTime.returnValue !== "save" || newExpiry === undefined) return;
    try {
      await DB.updateUser(editing.uid, { expiresAt: newExpiry });
      toast("Tempo de acesso atualizado."); await load();
    } catch (err) { toast(err.message, "err"); }
  });

  /* ---------------- senha ---------------- */
  const dlgPass = $("#dlg-pass");
  async function openPass(u) {
    if (DB.mode === "firebase") {
      if (!(await U.ask({ title: "Redefinir senha", text: `Vamos enviar um e-mail para ${u.email} com o link para criar uma nova senha.`, ok: "Enviar e-mail" }))) return;
      await DB.sendReset(u.email); toast("E-mail de redefinição enviado."); return;
    }
    editing = u; $("#pass-who").textContent = u.name; $("#new-pass").value = ""; dlgPass.showModal();
  }
  dlgPass.addEventListener("close", async () => {
    if (dlgPass.returnValue !== "save") return;
    const p = $("#new-pass").value;
    if (p.length < 6) return toast("A senha precisa ter pelo menos 6 caracteres.", "err");
    try { await DB.updateUser(editing.uid, { password: p }); toast("Senha alterada."); } catch (err) { toast(err.message, "err"); }
  });

  /* ---------- aviso de renovação para o cliente ---------- */
  const dlgRemind = $("#dlg-remind");
  let remindUser = null;
  function updateRemindLinks() {
    const text = $("#rm-text").value;
    const phone = $("#rm-phone").value.replace(/\D/g, "");
    const intl = phone ? (phone.length <= 11 ? "55" + phone : phone) : "";
    const wa = $("#rm-wa");
    wa.href = intl.length >= 12 ? `https://wa.me/${intl}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    wa.textContent = intl.length >= 12 ? "Enviar no WhatsApp" : "Escolher contato no WhatsApp";
    $("#rm-email").href = `mailto:${encodeURIComponent(remindUser.email)}?subject=${encodeURIComponent("Seu acesso ao Catálogo Online está vencendo")}&body=${encodeURIComponent(text.replace(/\*/g, ""))}`;
  }
  function openRemind(u) {
    remindUser = u;
    const d = U.daysLeft(u.expiresAt);
    $("#rm-who").textContent = `${u.name} · ${u.email} · ${d <= 0 ? "vencido em" : "vence em"} ${U.date(u.expiresAt)}`;
    $("#rm-text").value = U.reminderText(u);
    $("#rm-phone").value = (stats[u.uid] && stats[u.uid].whatsapp) || "";
    updateRemindLinks();
    dlgRemind.showModal();
  }
  // renovação em 1 clique, contando a partir do vencimento (ou de hoje, se já venceu)
  U.$$("#dlg-remind [data-renew]").forEach((b) => b.addEventListener("click", async () => {
    const days = Number(b.dataset.renew);
    const from = Math.max(Date.now(), remindUser.expiresAt || 0);
    const until = from + days * DB.DAY;
    try {
      await DB.updateUser(remindUser.uid, { expiresAt: until, ...(remindUser.active === false ? { active: true } : {}) });
      toast(`${remindUser.name} renovado até ${U.date(until)}.`);
      dlgRemind.close();
      await load();
    } catch (err) { toast(err.message, "err"); }
  }));
  $("#rm-text").addEventListener("input", updateRemindLinks);
  $("#rm-phone").addEventListener("input", updateRemindLinks);
  ["#rm-wa", "#rm-email"].forEach((s) => $(s).addEventListener("click", () => {
    toast(`Aviso preparado para ${remindUser.name}. Confira e envie.`);
    setTimeout(() => dlgRemind.close(), 300);
  }));

  // os números do topo filtram a lista
  U.$$(".stats [data-filter]").forEach((b) => b.addEventListener("click", () => {
    $("#filter").value = b.dataset.filter; render();
    showTab("lojas"); scrollTo({ top: 0, behavior: "smooth" });
  }));

  /* ---------- pedidos de liberação (cadastro e renovação por Pix) ---------- */
  var pedidos = [];
  const STATUS = {
    aguardando_pagamento: ["Aguardando pagamento", "expirando"],
    pagamento_informado: ["Pagamento informado", "ativo"],
    aprovado: ["Aprovado", "admin"],
    recusado: ["Recusado", "bloqueado"]
  };
  async function loadPedidos() {
    try { pedidos = await DB.listPedidos(); }
    catch (e) { $("#ped-list").innerHTML = `<li class="hint">Não foi possível carregar os pedidos. ${DB.mode === "firebase" ? "Confira se as regras novas do Firestore foram publicadas." : ""}</li>`; return; }
    pedidos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderPedidos(); renderHome();
  }
  function renderPedidos() {
    const f = $("#ped-filter").value;
    const open = pedidos.filter((p) => p.status === "aguardando_pagamento" || p.status === "pagamento_informado");
    $("#ped-count").hidden = !open.length; $("#ped-count").textContent = `${open.length} em aberto`;
    const list = pedidos.filter((p) => !f || (f === "abertos" ? open.includes(p) : p.status === f));
    $("#ped-list").innerHTML = list.length ? list.map((p) => {
      const [label, cls] = STATUS[p.status] || [p.status, ""];
      const phone = String(p.whatsapp || "").replace(/\D/g, "");
      return `<li data-id="${esc(p.id)}" class="${p.status === "pagamento_informado" ? "hot" : ""}">
        <div class="ped-main">
          <div class="ped-top"><b>${esc(p.loja || "")}</b><span class="pill ${cls}">${label}</span><span class="tag-type">${p.tipo === "renovacao" ? "Renovação" : "Novo cadastro"}</span></div>
          <div class="muted">${esc(p.responsavel || "")} · ${esc(p.email || "")} · ${esc(p.whatsapp || "")} · CNPJ ${esc(p.cnpj || "—")}</div>
          <div class="muted">${p.slug ? "/" + esc(p.slug) + " · " : ""}${Pix.money(p.valor || 0)} · ${p.dias || 30} dias · pedido ${esc(p.txid || p.id)} · ${U.dateTime(p.createdAt)}${p.paidAt ? " · pago informado " + U.dateTime(p.paidAt) : ""}</div>
        </div>
        <div class="ped-actions">
          ${p.status !== "aprovado" ? `<button class="btn sm primary" data-ped="ok">${p.tipo === "renovacao" ? "Aprovar e renovar" : "Aprovar e liberar"}</button>` : ""}
          ${phone ? `<a class="btn sm wa" target="_blank" rel="noopener" href="https://wa.me/55${phone}">WhatsApp</a>` : ""}
          ${p.status !== "aprovado" && p.status !== "recusado" ? `<button class="btn sm" data-ped="no">Recusar</button>` : ""}
          <button class="btn sm ghost danger" data-ped="del" aria-label="Excluir pedido">Excluir</button>
        </div>
      </li>`;
    }).join("") : `<li class="hint">${f === "abertos" ? "Nenhum pedido em aberto." : "Nenhum pedido."}</li>`;
  }
  $("#ped-filter").addEventListener("change", renderPedidos);
  $("#ped-list").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ped]"); if (!b) return;
    const p = pedidos.find((x) => x.id === b.closest("li").dataset.id); if (!p) return;
    try {
      if (b.dataset.ped === "del") {
        if (!(await U.ask({ title: "Excluir pedido?", text: `Pedido de ${p.loja}. A conta (se já existir) não é afetada.`, ok: "Excluir", danger: true }))) return;
        await DB.deletePedido(p.id); toast("Pedido excluído.");
      } else if (b.dataset.ped === "no") {
        if (!(await U.ask({ title: "Recusar pedido?", text: `${p.loja} não será liberado. Avise o cliente pelo WhatsApp se for o caso.`, ok: "Recusar", danger: true }))) return;
        await DB.updatePedido(p.id, { status: "recusado" }); toast("Pedido recusado.");
      } else if (b.dataset.ped === "ok") {
        b.disabled = true;
        await approve(p);
      }
      await loadPedidos();
    } catch (err) { toast(err.message, "err"); b.disabled = false; }
  });

  async function approve(p) {
    const dias = p.dias || 30;
    if (p.tipo === "renovacao") {
      const u = users.find((x) => x.uid === p.uid) || users.find((x) => x.email === p.email);
      if (!u) throw new Error("Não encontrei a conta desta loja para renovar.");
      if (!(await U.ask({ title: `Renovar ${u.name}?`, text: `Confirme que o Pix de ${Pix.money(p.valor)} caiu na sua conta. O acesso ganha +${dias} dias.`, ok: "Confirmar e renovar" }))) return;
      const until = Math.max(Date.now(), u.expiresAt || 0) + dias * DB.DAY;
      await DB.updateUser(u.uid, { expiresAt: until, active: true });
      await DB.updatePedido(p.id, { status: "aprovado", approvedAt: Date.now() });
      toast(`${u.name} renovado até ${U.date(until)}.`);
      await load();
      return;
    }
    if (!(await U.ask({ title: `Liberar ${p.loja}?`, text: `Confirme que o Pix de ${Pix.money(p.valor)} caiu na sua conta. A conta é criada com ${dias} dias de acesso e o cliente recebe um e-mail para criar a senha.`, ok: "Confirmar e liberar" }))) return;
    // senha provisória aleatória: o cliente cria a dele pelo e-mail de redefinição
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const temp = Array.from(crypto.getRandomValues(new Uint32Array(14)), (n) => chars[n % chars.length]).join("");
    const until = Date.now() + dias * DB.DAY;
    const u = await DB.createUser({ name: p.loja, email: p.email, password: temp, slug: p.slug, expiresAt: until, whatsapp: p.whatsapp, cnpj: p.cnpj, responsavel: p.responsavel });
    await DB.updatePedido(p.id, { status: "aprovado", approvedAt: Date.now(), userUid: u.uid });
    let senhaMsg = "";
    if (DB.mode === "firebase") {
      try { await DB.sendReset(p.email); senhaMsg = "Você vai receber um e-mail para criar a sua senha (confira o spam)."; }
      catch { senhaMsg = `Senha provisória: ${temp}`; }
    } else senhaMsg = `Senha provisória: ${temp}`;
    const login = new URL("index.html", location.href).href;
    const text = [`Olá, ${(p.responsavel || "").split(" ")[0]}! ✅ Seu *Catálogo Online* foi liberado.`, "",
      `Login: ${p.email}`, senhaMsg, `Entre por aqui: ${login}`, "",
      `Acesso válido até ${U.date(until)}.`].join("\n");
    const phone = String(p.whatsapp || "").replace(/\D/g, "");
    await U.ask({ title: "Conta liberada!", text: `${p.loja} já pode entrar. ${senhaMsg} Avise o cliente pelo WhatsApp com a mensagem pronta.`, ok: "Avisar no WhatsApp", cancel: "Fechar" })
      .then((go) => { if (go && phone) window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(text)}`, "_blank"); });
    await load();
  }

  /* ---------- alerta de novo pagamento ---------- */
  const SEEN = "cat_ped_seen", baseTitle = document.title;
  let seen = new Set(); try { seen = new Set(JSON.parse(localStorage.getItem(SEEN)) || []); } catch { /* ignore */ }
  let firstSnap = true, unseen = 0;
  const saveSeen = () => { try { localStorage.setItem(SEEN, JSON.stringify([...seen].slice(-500))); } catch { /* ignore */ } };
  const notifySupported = "Notification" in window;
  function paintNotifyBtn() {
    const b = $("#ped-notify");
    if (!notifySupported) { b.hidden = true; return; }
    const st = Notification.permission;
    b.textContent = st === "granted" ? "🔔 Alertas ativados" : st === "denied" ? "🔕 Alertas bloqueados" : "🔔 Ativar alertas";
    b.disabled = st !== "default";
    b.title = st === "denied" ? "Libere as notificações deste site nas configurações do navegador." : "";
  }
  $("#ped-notify").onclick = async () => { try { await Notification.requestPermission(); } catch { /* ignore */ } paintNotifyBtn(); if (Notification.permission === "granted") beep(); };
  paintNotifyBtn();
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[880, 0], [1320, 0.18]].forEach(([f, t]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.type = "sine"; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.4);
      });
    } catch { /* sem som */ }
  }
  const paintTitle = () => { document.title = unseen ? `(${unseen}) Novo pagamento · ${baseTitle}` : baseTitle; };
  addEventListener("focus", () => { unseen = 0; paintTitle(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { unseen = 0; paintTitle(); } });
  function alertNew(p) {
    const title = p.tipo === "renovacao" ? "Renovação paga" : "Novo cliente pagou";
    const body = `${p.loja || ""} · ${Pix.money(p.valor || 0)} · ${p.plano || ""}. Confira o Pix e libere.`;
    toast(`💰 ${title}: ${p.loja}`);
    beep();
    if (document.hidden || !document.hasFocus()) { unseen++; paintTitle(); }
    if (notifySupported && Notification.permission === "granted") {
      try {
        const n = new Notification(title, { body, tag: "ped-" + p.id, requireInteraction: true });
        n.onclick = () => { focus(); showTab("pedidos"); n.close(); };
      } catch { /* alguns celulares só notificam por service worker */ }
    }
  }
  function onPedidos(list) {
    pedidos = list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const paid = pedidos.filter((p) => p.status === "pagamento_informado");
    if (firstSnap) {
      // ao abrir o painel: avisa só do que chegou desde a última visita
      const news = paid.filter((p) => !seen.has(p.id));
      if (news.length) { toast(`💰 ${news.length} ${news.length === 1 ? "pagamento novo" : "pagamentos novos"} para liberar.`); beep(); }
      firstSnap = false;
    } else {
      paid.filter((p) => !seen.has(p.id)).forEach(alertNew);
    }
    paid.forEach((p) => seen.add(p.id)); saveSeen();
    renderPedidos(); renderHome();
  }
  DB.watchPedidos(onPedidos, () => loadPedidos()).catch(() => loadPedidos());
  await load();
  setInterval(() => { render(); renderHome(); }, 60000);
  /* ---------- Acessos ao sistema (só o admin) ---------- */
  var acDays = 30, acSeries = "visits", acData = null;
  const ONLINE_MS = 5 * 60000;
  const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "agora";
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60); if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24); return d === 1 ? "ontem" : `há ${d} dias`;
  };
  async function loadAcessos() {
    try {
      const [acc, st, us] = await Promise.all([DB.listAcessos(acDays), DB.listAllStats(acDays), DB.listUsers()]);
      acData = { acc, st, us };
      renderAcessos();
    } catch (e) {
      $("#ac-kpis").innerHTML = `<p class="hint">Não foi possível carregar os acessos. ${DB.mode === "firebase" ? "Publique as regras novas do Firestore (arquivo firestore.rules)." : ""}</p>`;
    }
  }
  function renderAcessos() {
    if (!acData || $("#acessos").closest("[hidden]") && !$("#home-online")) return;
    const { acc, st, us } = acData;
    const byUid = new Map(us.map((u) => [u.uid, u]));
    const storeOf = (u) => (u ? (u.role === "user" ? u.slug : (byUid.get(u.ownerUid) || u).slug) : "");
    const people = new Set(); let entries = 0;
    acc.forEach((d) => Object.keys(d.u || {}).forEach((uid) => { people.add(uid); entries += 1; }));
    const visitsByDay = {}, visitsBySlug = {};
    st.forEach((d) => { visitsByDay[d.day] = (visitsByDay[d.day] || 0) + (d.visits || 0); visitsBySlug[d.slug] = (visitsBySlug[d.slug] || 0) + (d.visits || 0); });
    const visits = Object.values(visitsByDay).reduce((a, b) => a + b, 0);
    const online = us.filter((u) => u.role !== "admin" && u.lastSeen && Date.now() - u.lastSeen < ONLINE_MS).sort((a, b) => b.lastSeen - a.lastSeen);
    const storesVisited = Object.values(visitsBySlug).filter((n) => n > 0).length;
    const period = acDays === 1 ? "hoje" : `em ${acDays} dias`;
    $("#ac-kpis").innerHTML = [
      ["Online agora", online.length, "nos últimos 5 minutos", "live"],
      ["Pessoas no sistema", people.size, `lojas e equipes ${period}`],
      ["Entradas", entries, `1 por pessoa por dia ${period}`],
      ["Visitas aos catálogos", visits, `${storesVisited} ${storesVisited === 1 ? "loja visitada" : "lojas visitadas"} ${period}`]
    ].map(([t, n, s, cls]) => `<div class="kpi ${cls || ""}"><small>${t}</small><b>${fmtN(n)}</b><span class="kpi-sub">${s}</span></div>`).join("");

    // gráfico
    const series = acc.map((d) => ({ day: d.day, n: acSeries === "visits" ? visitsByDay[d.day] || 0 : Object.keys(d.u || {}).length }));
    $("#ac-chart-title").textContent = acSeries === "visits" ? "Visitas aos catálogos por dia" : "Pessoas no sistema por dia";
    U.columnChart($("#ac-chart"), series, acSeries === "visits" ? ["visita", "visitas"] : ["pessoa", "pessoas"]);

    $("#tb-online").textContent = online.length || "";
    renderHome();
    // online agora
    const roleTxt = (u) => (u.role === "user" ? "Loja" : DB.ROLE_LABEL[u.role] || "");
    $("#ac-online").innerHTML = $("#home-online").innerHTML = online.length ? online.map((u) => {
      const s = storeOf(u);
      return `<li><span class="av" aria-hidden="true">${esc((u.name || u.email || "?").trim().charAt(0).toUpperCase())}</span>
        <div><b>${esc(u.name || u.email)}</b><small>${esc(roleTxt(u))}${s && u.role !== "user" ? " · " + esc(s) : ""}</small></div><time>${ago(u.lastSeen)}</time></li>`;
    }).join("") : `<li class="none">Ninguém online agora.${(() => { const last = us.filter((u) => u.role !== "admin" && u.lastSeen).sort((a, b) => b.lastSeen - a.lastSeen)[0]; return last ? `<br><small>Último acesso: ${esc(last.name || last.email)}, ${ago(last.lastSeen)}.</small>` : ""; })()}</li>`;

    // lojas
    const teamEntries = {};
    acc.forEach((d) => Object.keys(d.u || {}).forEach((uid) => { const s = storeOf(byUid.get(uid)); if (s) teamEntries[s] = (teamEntries[s] || 0) + 1; }));
    const lastBySlug = {};
    us.forEach((u) => { const s = storeOf(u); if (s && u.lastSeen) lastBySlug[s] = Math.max(lastBySlug[s] || 0, u.lastSeen); });
    const owners = us.filter((u) => u.role === "user");
    const rows = owners.map((u) => ({ u, v: visitsBySlug[u.slug] || 0, e: teamEntries[u.slug] || 0, last: lastBySlug[u.slug] || u.lastLogin || 0 }))
      .sort((a, b) => b.v - a.v || b.e - a.e || b.last - a.last);
    const best = Math.max(1, ...rows.map((r) => r.v));
    $("#ac-stores").innerHTML = rows.length ? rows.slice(0, 15).map((r) => `<tr>
        <td><b>${esc(r.u.name)}</b><small class="muted-block">${esc(r.u.slug)}</small></td>
        <td class="num" data-label="Visitas no catálogo"><div class="ac-bar"><div class="meter"><i style="width:${r.v ? Math.max(4, (r.v / best) * 100) : 0}%"></i></div><b>${fmtN(r.v)}</b></div></td>
        <td class="num" data-label="Entradas da equipe">${fmtN(r.e)}</td>
        <td data-label="Último acesso">${r.last ? ago(r.last) : "nunca"}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Nenhuma loja cadastrada ainda.</td></tr>`;
  }
  $$("#ac-period [data-days]").forEach((b) => b.addEventListener("click", () => {
    acDays = Number(b.dataset.days);
    $$("#ac-period [data-days]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    loadAcessos();
  }));
  $$("#ac-series [data-series]").forEach((b) => b.addEventListener("click", () => {
    acSeries = b.dataset.series;
    $$("#ac-series [data-series]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderAcessos();
  }));
  loadAcessos();
  setInterval(() => { if (!document.hidden) loadAcessos(); }, 60000);
  let acResize; addEventListener("resize", () => { clearTimeout(acResize); acResize = setTimeout(renderAcessos, 200); });
})();
