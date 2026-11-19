(async () => {
  const { $, $$, esc } = U;
  const slug = new URLSearchParams(location.search).get("loja") || "";
  const PAGE = 40;

  const fail = (msg) => {
    $("#loading").hidden = true; $("#unavailable").hidden = false;
    if (msg) $("#unavailable-msg").textContent = msg;
  };
  if (!slug) return fail("Endereço do catálogo incompleto. Confira o link recebido.");

  let cat;
  try { cat = await DB.getCatalogBySlug(slug); } catch { return fail("Não foi possível carregar o catálogo. Tente novamente."); }
  if (!cat) return fail("Catálogo não encontrado. Confira o link recebido.");
  if (DB.accessStatus(cat) !== "ativo") return fail("Este catálogo está temporariamente fora do ar.");

  const store = cat.store || {};
  const products = (cat.products || []).filter((p) => p.code);
  document.title = store.name || "Catálogo";
  if (store.accent) document.documentElement.style.setProperty("--accent", store.accent);

  /* capa */
  const hero = $("#hero");
  if (store.cover) hero.style.backgroundImage = `url("${store.cover}")`; else hero.classList.add("no-cover");
  $("#store-name").textContent = store.name || "Catálogo";
  $("#foot-name").textContent = store.name || "";
  $("#store-about").textContent = store.about || "";
  const wa = store.whatsapp ? (store.whatsapp.length <= 11 ? "55" + store.whatsapp : store.whatsapp) : "";
  const waLink = (text) => `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
  $("#hero-links").innerHTML =
    (wa ? `<a href="${waLink("Olá! Vi o catálogo e gostaria de fazer um pedido.")}" target="_blank" rel="noopener">WhatsApp</a>` : "") +
    (store.instagram ? `<a href="https://instagram.com/${encodeURIComponent(store.instagram)}" target="_blank" rel="noopener">@${esc(store.instagram)}</a>` : "");
  if (wa) { const f = $("#wa-float"); f.hidden = false; f.href = waLink("Olá! Vi o catálogo e tenho uma dúvida."); }

  /* card do produto */
  const priceHtml = (p) => {
    const off = U.discount(p);
    if (off) return `<div class="price"><span class="old">${U.money(p.price)}</span><span class="now promo">${U.money(p.promoPrice)}</span></div>`;
    const v = p.price ?? p.promoPrice;
    return v != null ? `<div class="price"><span class="now">${U.money(v)}</span></div>` : `<div class="price"><span class="code">Consulte</span></div>`;
  };
  const tag = (p) => { const off = U.discount(p); return off ? `<span class="promo-tag"><small>PROMO</small>-${off}%</span>` : ""; };
  const card = (p) => `
    <button class="item${U.discount(p) ? " is-promo" : ""}" data-code="${esc(p.code)}">
      ${tag(p)}
      ${U.imgTag(p, 500, "ph")}
      <div class="body"><span class="code">Cód. ${esc(p.code)}</span><span class="name">${esc(p.name || "Produto")}</span>${priceHtml(p)}</div>
    </button>`;

  /* promoções */
  const promos = products.filter((p) => U.discount(p));
  if (promos.length) { $("#promo-section").hidden = false; $("#promo-row").innerHTML = promos.map(card).join(""); }

  /* categorias e busca */
  const cats = [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  let activeCat = "", shown = PAGE;
  $("#chips").innerHTML = ["", ...cats].map((c) => `<button aria-pressed="${c === "" ? "true" : "false"}" data-cat="${esc(c)}">${c ? esc(c) : "Todos"}</button>`).join("");
  if (!cats.length) $("#chips").hidden = true;
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    activeCat = b.dataset.cat; shown = PAGE;
    $$("#chips button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render();
  });
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  $("#q").addEventListener("input", () => { shown = PAGE; render(); });

  function render() {
    const q = norm($("#q").value.trim());
    const list = products.filter((p) => (!activeCat || p.category === activeCat) &&
      (!q || norm(p.code).includes(q) || norm(p.name).includes(q) || norm(p.description).includes(q)));
    $("#grid").innerHTML = list.slice(0, shown).map(card).join("");
    $("#count").textContent = `${list.length} ${list.length === 1 ? "item" : "itens"}`;
    $("#empty").hidden = list.length > 0;
    $("#more").hidden = list.length <= shown;
  }
  $("#more").onclick = () => { shown += PAGE; render(); };
  render();

  /* detalhe */
  const dlg = $("#detail");
  const byCode = new Map(products.map((p) => [String(p.code), p]));
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".item[data-code]"); if (!b) return;
    open(byCode.get(b.dataset.code));
  });
  function open(p) {
    if (!p) return;
    const imgs = p.images && p.images.length ? p.images : [];
    const showImg = (i) => {
      $("#d-main").innerHTML = tag(p) + (imgs.length
        ? `<img src="${U.driveImg(imgs[i], 1200)}" data-fallback="${U.driveImgFallback(imgs[i], 1200)}" alt="${esc(p.name)}" referrerpolicy="no-referrer">`
        : U.imgTag(p, 1200, ""));
      $$("#d-thumbs button").forEach((t, j) => t.setAttribute("aria-current", String(i === j)));
    };
    $("#d-thumbs").innerHTML = imgs.length > 1 ? imgs.map((id, i) =>
      `<button data-i="${i}" aria-label="Foto ${i + 1}"><img src="${U.driveImg(id, 160)}" data-fallback="${U.driveImgFallback(id, 160)}" alt="" referrerpolicy="no-referrer"></button>`).join("") : "";
    $("#d-thumbs").onclick = (e) => { const t = e.target.closest("button"); if (t) showImg(Number(t.dataset.i)); };
    showImg(0);
    $("#d-code").textContent = `Cód. ${p.code}${p.category ? " · " + p.category : ""}`;
    $("#d-name").textContent = p.name || "Produto";
    $("#d-price").outerHTML = priceHtml(p).replace('class="price"', 'class="price" id="d-price"');
    $("#d-desc").textContent = p.description || "";
    const waBtn = $("#d-wa");
    waBtn.hidden = !wa;
    if (wa) waBtn.href = waLink(`Olá! Tenho interesse no produto:\nCód. ${p.code} — ${p.name || ""}\n${location.href.split("#")[0]}`);
    dlg.showModal();
  }
  $("#d-close").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  $("#loading").hidden = true; $("#app").hidden = false;
})();
