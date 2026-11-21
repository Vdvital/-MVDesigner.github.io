(async () => {
  const { $, $$, esc, toast } = U;
  const me = await U.requireLogin("admin");
  if (!me) return;
  U.modeBanner();
  $("#me-email").textContent = me.email;
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
      $$("#nu-quick button").forEach((x) => x.classList.toggle("on", x.dataset.days === "30")); chosenDays = 30;
      await load();
    } catch (err) { toast(err.message, "err"); }
    btn.disabled = false;
  });

  /* ---------------- lista ---------------- */
  async function load() {
    try {
      [users, stats] = await Promise.all([DB.listUsers(), DB.listCatalogStats()]);
    } catch (e) { toast(e.message, "err"); return; }
    // Vendedores e representantes são geridos por cada loja; aqui aparecem só como contagem.
    teamCount = {};
    users.filter((u) => DB.TEAM.includes(u.role)).forEach((u) => { teamCount[u.ownerUid] = (teamCount[u.ownerUid] || 0) + 1; });
    users = users.filter((u) => !DB.TEAM.includes(u.role));
    users.sort((a, b) => (a.role === "admin" ? -1 : b.role === "admin" ? 1 : (b.createdAt || 0) - (a.createdAt || 0)));
    const clients = users.filter((u) => u.role !== "admin");
    const sits = clients.map(situation);
    $("#st-total").textContent = clients.length;
    $("#st-active").textContent = sits.filter((s) => s === "ativo" || s === "expirando").length;
    $("#st-soon").textContent = sits.filter((s) => s === "expirando").length;
    $("#st-off").textContent = sits.filter((s) => s === "expirado" || s === "bloqueado").length;
    render();
  }

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
        <td class="muted">${U.dateTime(u.lastLogin)}</td>
        <td class="actions">${u.role === "admin" ? "" : `
          ${U.renewState(u) && u.active !== false ? `<button class="btn sm remind" data-act="remind">Avisar ⏳</button>` : ""}
          <button class="btn sm" data-act="time">Tempo</button>
          <button class="btn sm" data-act="toggle">${u.active === false ? "Desbloquear" : "Bloquear"}</button>
          <button class="btn sm" data-act="pass">Senha</button>
          <button class="btn sm danger" data-act="del" aria-label="Excluir ${esc(u.name)}">Excluir</button>`}
        </td>
      </tr>`).join("") : `<tr><td colspan="5" class="empty">Nenhum usuário encontrado.</td></tr>`;
  }
  $("#search").addEventListener("input", render);
  $("#filter").addEventListener("change", render);

  $("#users").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]"); if (!btn) return;
    const u = users.find((x) => x.uid === btn.closest("tr").dataset.uid); if (!u) return;
    const act = btn.dataset.act;
    try {
      if (act === "time") return openTime(u);
      if (act === "remind") return openRemind(u);
      if (act === "pass") return openPass(u);
      if (act === "toggle") {
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
    $("#list-title").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  // no celular o formulário de criar começa fechado, para a lista aparecer logo
  if (matchMedia("(max-width: 760px)").matches) $("#create-card").open = false;

  /* ---------- pedidos de liberação (cadastro e renovação por Pix) ---------- */
  let pedidos = [];
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
    renderPedidos();
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

  await loadPedidos();
  setInterval(loadPedidos, 60000);
  await load();
  setInterval(render, 60000);
})();
