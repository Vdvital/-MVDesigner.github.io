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
  $("#logout").onclick = async () => { await DB.logout(); location.replace("index.html"); };
  $("#copy-link").onclick = async () => {
    try { await navigator.clipboard.writeText(link); } catch { $("#cat-link").select(); document.execCommand("copy"); }
    toast("Link copiado!");
  };

  /* ---------- acesso ---------- */
  function renderAccess() {
    const d = U.daysLeft(me.expiresAt);
    $("#acc-days").textContent = d == null ? "Sem limite" : `${d} dia${d === 1 ? "" : "s"}`;
    const soon = d != null && d <= 7;
    $("#acc-pill").innerHTML = `<span class="pill ${soon ? "expirando" : "ativo"}">${me.expiresAt ? "até " + U.date(me.expiresAt) : "Ativo"}</span>`;
    if (soon) toast(`Seu acesso vence em ${d} dia${d === 1 ? "" : "s"}. Fale com o administrador.`, "err");
  }
  renderAccess();

  async function save(msg) {
    try {
      cat = await DB.saveMyCatalog(me, { store, products });
      if (msg) toast(msg);
      return true;
    } catch (err) {
      toast(err.message, "err");
      if (/acesso/.test(err.message)) setTimeout(() => location.replace("index.html?expirado=1"), 2000);
      return false;
    }
  }

  /* ---------- loja e capa ---------- */
  const fill = () => {
    $("#s-name").value = store.name || "";
    $("#s-about").value = store.about || "";
    $("#s-wa").value = store.whatsapp || "";
    $("#s-ig").value = store.instagram || "";
    $("#s-accent").value = store.accent || "#ff6a36";
    $("#drive-link").value = store.driveFolderId ? `https://drive.google.com/drive/folders/${store.driveFolderId}` : "";
    showCover();
    const wa = `Confira nosso catálogo: ${link}`;
    $("#share-wa").href = `https://wa.me/?text=${encodeURIComponent(wa)}`;
  };
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

  $("#store-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    store.name = $("#s-name").value.trim();
    store.about = $("#s-about").value.trim();
    store.whatsapp = $("#s-wa").value.replace(/\D/g, "");
    store.instagram = $("#s-ig").value.trim().replace(/^@/, "");
    store.accent = $("#s-accent").value;
    await save("Dados da loja salvos!");
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
      if (f === "promo" && !U.discount(p)) return false;
      if (f === "nophoto" && (p.images?.length || p.imageUrl)) return false;
      return !q || String(p.code).toLowerCase().includes(q) || String(p.name).toLowerCase().includes(q);
    });
    const withPhoto = products.filter((p) => p.images?.length || p.imageUrl).length;
    $("#prod-count").textContent = products.length ? `· ${products.length} itens · ${withPhoto} com foto` : "";
    $("#products").innerHTML = list.length ? list.slice(0, 400).map(({ p, i }) => {
      const off = U.discount(p);
      return `<button class="p-mini" data-i="${i}" style="text-align:left;cursor:pointer;padding:0">
        ${U.imgTag(p, 300, "thumb")}
        ${off ? `<span class="flag">-${off}%</span>` : ""}
        ${!(p.images?.length || p.imageUrl) ? `<span class="nophoto">sem foto</span>` : ""}
        <div class="info"><span class="code">${esc(p.code)}</span><b>${esc(p.name || "Sem nome")}</b>
        <span>${off ? `<s class="code">${U.money(p.price)}</s> ${U.money(p.promoPrice)}` : U.money(p.price) || "&nbsp;"}</span></div>
      </button>`;
    }).join("") + (list.length > 400 ? `<p class="hint">Mostrando 400 de ${list.length}. Use a busca.</p>` : "")
      : `<div class="empty" style="grid-column:1/-1">${products.length ? "Nenhum produto encontrado." : "Nenhum produto ainda. Importe sua planilha do Excel ou baixe o modelo."}</div>`;
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
    $("#pe-drive").textContent = p.images?.length ? `${p.images.length} foto(s) do Drive ligada(s) a este código.` : "";
    $("#pe-delete").hidden = i < 0;
    dlgProd.showModal();
  };
  $("#products").addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) openProduct(Number(b.dataset.i)); });
  $("#add-product").onclick = () => openProduct(-1);
  dlgProd.addEventListener("close", async () => {
    const v = dlgProd.returnValue;
    if (v === "delete" && editIndex >= 0) {
      if (!confirm("Excluir este produto?")) return;
      products.splice(editIndex, 1);
    } else if (v === "save") {
      const code = $("#pe-code").value.trim();
      if (!code) return toast("O código é obrigatório.", "err");
      if (products.some((p, i) => i !== editIndex && String(p.code) === code)) return toast("Já existe um produto com esse código.", "err");
      const p = {
        ...(editIndex >= 0 ? products[editIndex] : { images: [] }),
        ...(editIndex >= 0 && String(products[editIndex].code) !== code ? { images: [] } : {}),
        code, name: $("#pe-name").value.trim(), description: $("#pe-desc").value.trim(), category: $("#pe-cat").value.trim(),
        price: U.parseMoney($("#pe-price").value), promoPrice: U.parseMoney($("#pe-promo").value), imageUrl: $("#pe-img").value.trim()
      };
      if (editIndex >= 0) products[editIndex] = p; else products.unshift(p);
    } else return;
    renderProducts();
    await save("Produtos salvos!");
  });
})();
