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
  let products = (cat.products || []).filter((p) => p.code);

  /* ---------- quem está vendo: preços só para loja, vendedores e representantes ---------- */
  let viewer = null;
  try { viewer = await DB.current(); } catch { viewer = null; }
  const isStaff = !!viewer && (viewer.role === "admin" || (viewer.slug === slug && ["user", ...DB.TEAM].includes(viewer.role)));
  if (viewer) U.presence(viewer);
  // Modo apresentação: a equipe mostra os produtos ao cliente sem nenhum preço na tela
  const presentation = new URLSearchParams(location.search).get("apresentacao") === "1";
  const pageUrl = (extra) => `${location.origin}${location.pathname}?loja=${encodeURIComponent(slug)}${extra || ""}`;
  let prices = null;
  if (isStaff && !presentation) { try { prices = await DB.getPrices(slug); } catch { prices = null; } }
  const canSee = !!prices;
  if (canSee) products = products.map((p) => ({ ...p, ...(prices[String(p.code)] || {}) }));
  document.body.classList.toggle("staff", canSee);
  if (isStaff) {
    $("#staff-bar").hidden = false;
    $("#staff-who").textContent = `${DB.ROLE_LABEL[viewer.role] || ""}: ${viewer.name}`;
    $("#staff-msg").textContent = presentation ? "Modo apresentação: sem preços na tela."
      : canSee ? "Você está vendo os preços." : "Não foi possível carregar os preços.";
    const mode = $("#staff-mode");
    mode.hidden = false;
    mode.textContent = presentation ? "Mostrar preços" : "Modo apresentação";
    mode.href = presentation ? pageUrl() : pageUrl("&apresentacao=1");
    $("#staff-copy").hidden = false;
    $("#staff-copy").onclick = async () => {
      const link = pageUrl();
      try { await navigator.clipboard.writeText(link); U.toast("Link para clientes copiado (sem preços)."); }
      catch { prompt("Copie o link para clientes (sem preços):", link); }
    };
    $("#staff-logout").onclick = (e) => U.logout(e.currentTarget, "reload");
    if (viewer.role === "user" || viewer.role === "admin") {
      $("#staff-panel").hidden = false;
      $("#staff-panel").href = viewer.role === "admin" ? "admin.html" : "painel.html";
    }
  } else {
    $("#staff-login").hidden = false;
  }
  const byCode = new Map(products.map((p) => [String(p.code), p]));

  /* ---------- estatísticas de procura (para o painel "Mais procurados" da loja) ----------
     Junta os eventos na memória e grava de uma vez (a cada 15 s e ao sair), para gastar pouco do banco.
     A equipe logada não conta como visitante; só os pedidos/orçamentos dela entram. */
  const statKey = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  const codeKey = (c) => String(c).replace(/[.\/\[\]*`~#$]/g, "_").slice(0, 60);
  let stat = { visits: 0, v: {}, c: {}, o: {}, s: {}, sz: {}, cat: {} }, statDirty = false;
  function track(kind, key, n = 1, always = false) {
    if (isStaff && !always) return;
    if (kind === "visits") stat.visits += n;
    else { if (!key) return; stat[kind][key] = (stat[kind][key] || 0) + n; }
    statDirty = true;
  }
  async function flushStats() {
    if (!statDirty) return;
    const delta = stat; stat = { visits: 0, v: {}, c: {}, o: {}, s: {}, sz: {}, cat: {} }; statDirty = false;
    try { await DB.track(slug, delta); } catch { /* estatística nunca atrapalha a venda */ }
  }
  setInterval(flushStats, 15000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushStats(); });
  addEventListener("pagehide", flushStats);
  // uma visita por pessoa por dia
  try {
    const vk = `cat_visit_${slug}_${new Date().toDateString()}`;
    if (!localStorage.getItem(vk)) { localStorage.setItem(vk, "1"); track("visits"); }
  } catch { track("visits"); }

  /* pedido por caixa: o carrinho guarda unidades; produtos com CX andam de caixa em caixa */
  const boxOf = (code) => (byCode.get(String(code)) || {}).boxQty || 0;
  const stepOf = (code) => boxOf(code) || 1;
  const boxesTxt = (code, n) => {
    const b = boxOf(code); if (!b) return "";
    const cx = Math.floor(n / b), rest = n % b;
    return rest ? `${cx ? cx + " cx + " : ""}${rest} un` : `${cx} cx`;
  };
  /** "24 un (2 cx)" para produto com caixa; "3x" para os outros. */
  const qtyTxt = (code, n) => (boxOf(code) ? `${boxesTxt(code, n)} (${n} un)` : `${n} cx`);
  /** Quantas caixas mostrar no campo de quantidade. */
  const boxesOf = (code, n) => (boxOf(code) ? Math.max(1, Math.round(n / boxOf(code))) : n);
  document.title = store.name || "Catálogo";
  if (store.accent) document.documentElement.style.setProperty("--accent", store.accent);
  // logo da loja: ícone da aba do navegador e selo no topo do catálogo
  if (store.logo) {
    U.setFavicon(store.logo);
    const lg = $("#store-logo"); lg.src = store.logo; lg.alt = `Logo ${store.name || ""}`; lg.hidden = false;
  }

  /* ---------- capa ---------- */
  const hero = $("#hero");
  if (store.cover) hero.style.backgroundImage = `url("${store.cover}")`; else hero.classList.add("no-cover");
  $("#store-name").textContent = store.name || "Catálogo";
  $("#foot-name").textContent = store.name || "";
  $("#store-about").textContent = store.about || "";
  const intl = (n) => { n = String(n || "").replace(/\D/g, ""); return n ? (n.length <= 11 ? "55" + n : n) : ""; };
  const sellers = [...(store.team || []), ...(store.sellers || [])].map((s) => ({ name: s.name || "Vendedor", wa: intl(s.whatsapp) })).filter((s) => s.wa);
  const wa = intl(store.whatsapp) || (sellers[0] && sellers[0].wa) || "";
  // WhatsApp de quem monta o orçamento: o do próprio vendedor/representante (ou o da loja, para o dono)
  let myWa = !canSee ? "" : intl(viewer.whatsapp) || (viewer.role === "user" ? intl(store.whatsapp) : "");
  const fmtPhone = (n) => n.replace(/^55/, "").replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
  const waLink = (text, num = wa) => `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  $("#hero-links").innerHTML =
    (wa ? `<a href="${waLink("Olá! Vi o catálogo e gostaria de fazer um pedido.")}" target="_blank" rel="noopener">WhatsApp</a>` : "") +
    (store.instagram ? `<a href="https://instagram.com/${encodeURIComponent(store.instagram)}" target="_blank" rel="noopener">@${esc(store.instagram)}</a>` : "");
  if (wa) { const f = $("#wa-float"); f.hidden = false; f.href = waLink("Olá! Vi o catálogo e tenho uma dúvida."); }

  /* ---------- preço ---------- */
  const unitPrice = (p) => (!canSee ? null : U.discount(p) ? p.promoPrice : p.price ?? p.promoPrice ?? null);
  const isPromo = (p) => (canSee ? U.discount(p) > 0 || !!p.tagPromo : !!p.promo);
  const isNew = (p) => !!p.isNew;
  const priceHtml = (p, id = "") => {
    const off = U.discount(p), attr = id ? ` id="${id}"` : "";
    if (!canSee) return `<div class="price"${attr}><span class="ask">Preço sob consulta</span></div>`;
    if (off) return `<div class="price"${attr}><span class="old">${U.money(p.price)}</span><span class="now promo">${U.money(p.promoPrice)}</span></div>`;
    const v = unitPrice(p);
    return `<div class="price"${attr}>${v != null ? `<span class="now">${U.money(v)}</span>` : `<span class="code">Consulte</span>`}</div>`;
  };
  const tag = (p) => {
    if (!isPromo(p)) return "";
    const off = U.discount(p);
    return off ? `<span class="promo-tag"><small>PROMO</small>-${off}%</span>` : `<span class="promo-tag only">PROMO</span>`;
  };

  /* ---------- card ---------- */
  const card = (p) => `
    <article class="item${isPromo(p) ? " is-promo" : ""}${isNew(p) ? " is-new" : ""}">
      ${tag(p)}${isNew(p) ? `<span class="new-tag" aria-label="Novidade">NOVO</span>` : ""}
      <button class="open" data-code="${esc(p.code)}" aria-label="Ver detalhes de ${esc(p.name || p.code)}">
        ${U.imgTag(p, 500, "ph")}
        <div class="body"><span class="code-row"><span class="code">Cód. ${esc(p.code)}</span>${U.boxBadge(p)}</span><span class="name">${esc(p.name || "Produto")}</span>${U.colorDots(p, 6)}${priceHtml(p)}</div>
      </button>
      <div class="buy" data-buy="${esc(p.code)}">${buyInner(String(p.code))}</div>
    </article>`;
  /** Botão do cartão: "+ Adicionar" ou o seletor − qtd + quando o item já está no carrinho. */
  function buyInner(code) {
    const n = cart && cart[code];
    return n
      ? `<div class="stepper" role="group" aria-label="Quantidade no carrinho"><button type="button" data-dec="${esc(code)}" aria-label="${boxOf(code) ? "Tirar uma caixa" : "Tirar um"}">−</button><span aria-live="polite">${boxOf(code) ? `<b>${boxesTxt(code, n)}</b> · ${n} un` : `<b>${n} cx</b> no carrinho`}</span><button type="button" data-inc="${esc(code)}" aria-label="${boxOf(code) ? "Colocar mais uma caixa" : "Colocar mais um"}">+</button></div>`
      : `<button class="add" data-add="${esc(code)}">${boxOf(code) ? `+ Adicionar caixa` : "+ Adicionar"}</button>`;
  }
  const refreshBuy = () => $$("[data-buy]").forEach((el) => { el.innerHTML = buyInner(el.dataset.buy); });

  /* ---------- promoções ---------- */
  const promos = products.filter(isPromo);
  const news = products.filter(isNew);
  if (promos.length) { $("#promo-section").hidden = false; $("#promo-row").innerHTML = promos.map(card).join(""); }
  if (news.length) { $("#new-section").hidden = false; $("#new-row").innerHTML = news.map(card).join(""); }

  /* ---------- categorias ---------- */
  const cats = [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  let activeCat = "", shown = PAGE;
  const chips = $("#chips");
  chips.innerHTML = ["", ...cats].map((c) => `<button aria-pressed="${c === "" ? "true" : "false"}" data-cat="${esc(c)}">${c ? esc(c) : "Todos"}</button>`).join("");
  if (!cats.length) { chips.hidden = true; $("#tab-categorias").hidden = true; }

  $("#cat-grid").innerHTML = cats.map((c) => {
    const items = products.filter((p) => p.category === c);
    const withImg = items.find((p) => p.images?.length || p.imageUrl) || items[0];
    const promo = items.filter(isPromo).length;
    return `<button class="cat-card" data-cat="${esc(c)}">
      ${U.imgTag(withImg, 400, "cat-img")}
      <span class="cat-info"><b>${esc(c)}</b><small>${items.length} ${items.length === 1 ? "produto" : "produtos"}${promo ? ` · <em>${promo} em promoção</em>` : ""}</small></span>
    </button>`;
  }).join("");

  function setCategory(c) {
    if (c) track("cat", statKey(c));
    activeCat = c; shown = PAGE;
    $$("#chips button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.cat === c)));
    $("#all-label").textContent = c || "Produtos";
    render();
  }
  chips.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setCategory(b.dataset.cat); });
  $("#cat-grid").addEventListener("click", (e) => {
    const b = e.target.closest(".cat-card"); if (!b) return;
    setCategory(b.dataset.cat); showView("produtos");
    $("#all-title").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ---------- abas ---------- */
  function showView(v) {
    $$(".tabs [role=tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === v)));
    $("#view-produtos").hidden = v !== "produtos";
    $("#view-categorias").hidden = v !== "categorias";
    $(".chips-wrap").hidden = v !== "produtos";
    if (v !== "produtos") { panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); }
  }
  $(".tabs").addEventListener("click", (e) => { const t = e.target.closest("[role=tab]"); if (t) showView(t.dataset.view); });

  /* ---------- busca e lista ---------- */
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let searchTimer;
  $("#q").addEventListener("input", () => {
    shown = PAGE; showView("produtos"); render();
    // registra a busca quando a pessoa para de digitar (e se não achou nada)
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const term = statKey($("#q").value);
      if (term.length < 3) return;
      track("s", term);
      if (!$("#empty").hidden) track("sz", term);
    }, 1400);
  });

  /* ---------- filtro de preço ---------- */
  const priced = products.map(unitPrice).filter((v) => v != null);
  const pf = { min: null, max: null, sort: "", promo: false, news: false };
  const panel = $("#price-panel"), toggle = $("#filter-toggle");
  toggle.onclick = () => {
    const open = panel.hidden;
    panel.hidden = !open; toggle.setAttribute("aria-expanded", String(open));
  };
  if (!promos.length) $(".pp-check").hidden = true;

  // Faixas automáticas a partir dos preços do catálogo
  const STEPS = [10, 20, 30, 50, 100, 150, 200, 300, 500, 1000, 2000, 5000, 10000];
  let ranges = [];
  if (priced.length > 1) {
    const lo = Math.min(...priced), hi = Math.max(...priced);
    const inside = STEPS.filter((s) => s > lo && s < hi);
    const pick = inside.length <= 3 ? inside : [0.25, 0.5, 0.75].map((f) => inside[Math.round(f * (inside.length - 1))]);
    const bounds = [...new Set(pick)];
    ranges = bounds.map((b, i) => [i ? bounds[i - 1] : null, b]).concat(bounds.length ? [[bounds[bounds.length - 1], null]] : []);
    ranges = ranges.filter(([a, b]) => priced.some((v) => (a == null || v >= a) && (b == null || v <= b)));
  }
  const rangeLabel = ([a, b]) => (a == null ? `Até ${U.money(b)}` : b == null ? `Acima de ${U.money(a)}` : `${U.money(a)} a ${U.money(b)}`);
  $("#pp-ranges").innerHTML = ranges.map((r, i) => `<button type="button" aria-pressed="false" data-range="${i}">${rangeLabel(r).replace(/,00/g, "")}</button>`).join("");
  if (!ranges.length) $("#pp-ranges").hidden = true;
  if (!priced.length) {
    // Sem preços visíveis: o filtro fica só com promoções e ordem por nome
    $("#pp-price-group").hidden = true;
    $$("#pp-sort option[data-price]").forEach((o) => { o.disabled = true; o.hidden = true; });
  }

  const fmtInput = (v) => (v == null ? "" : String(v).replace(".", ","));
  function syncRangeButtons() {
    $$("#pp-ranges [data-range]").forEach((b) => {
      const [a, c] = ranges[b.dataset.range];
      b.setAttribute("aria-pressed", String(a === pf.min && c === pf.max));
    });
  }
  function applyFilters() {
    const n = (pf.min != null || pf.max != null ? 1 : 0) + (pf.sort ? 1 : 0) + (pf.promo ? 1 : 0) + (pf.news ? 1 : 0);
    $("#filter-count").textContent = n; $("#filter-count").hidden = !n;
    toggle.classList.toggle("on", !!n);
    syncRangeButtons(); shown = PAGE; render();
  }
  $("#pp-ranges").addEventListener("click", (e) => {
    const b = e.target.closest("[data-range]"); if (!b) return;
    const [a, c] = ranges[b.dataset.range];
    const same = a === pf.min && c === pf.max;
    pf.min = same ? null : a; pf.max = same ? null : c;
    $("#pp-min").value = fmtInput(pf.min); $("#pp-max").value = fmtInput(pf.max);
    applyFilters();
  });
  ["#pp-min", "#pp-max"].forEach((s) => $(s).addEventListener("input", () => {
    pf.min = U.parseMoney($("#pp-min").value); pf.max = U.parseMoney($("#pp-max").value);
    applyFilters();
  }));
  $("#pp-sort").onchange = (e) => { pf.sort = e.target.value; applyFilters(); };
  $("#pp-promo").onchange = (e) => { pf.promo = e.target.checked; applyFilters(); };
  $("#pp-new").onchange = (e) => { pf.news = e.target.checked; applyFilters(); };
  if (!news.length) $("#pp-new-label").hidden = true;
  $("#pp-clear").onclick = () => {
    Object.assign(pf, { min: null, max: null, sort: "", promo: false, news: false });
    $("#pp-min").value = ""; $("#pp-max").value = ""; $("#pp-sort").value = ""; $("#pp-promo").checked = false; $("#pp-new").checked = false;
    applyFilters();
  };

  function render() {
    const q = norm($("#q").value.trim());
    const lo = pf.min, hi = pf.max;
    const list = products.filter((p) => {
      if (activeCat && p.category !== activeCat) return false;
      if (q && !(norm(p.code).includes(q) || norm(p.name).includes(q) || norm(p.description).includes(q))) return false;
      if (pf.promo && !isPromo(p)) return false;
      if (pf.news && !isNew(p)) return false;
      if (lo != null || hi != null) {
        const v = unitPrice(p);
        if (v == null || (lo != null && v < lo) || (hi != null && v > hi)) return false;
      }
      return true;
    });
    const price = (p) => unitPrice(p) ?? Infinity;
    if (pf.sort === "asc") list.sort((a, b) => price(a) - price(b));
    if (pf.sort === "desc") list.sort((a, b) => (unitPrice(b) ?? -1) - (unitPrice(a) ?? -1));
    if (pf.sort === "off") list.sort((a, b) => U.discount(b) - U.discount(a));
    if (pf.sort === "name") list.sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
    const filtering = lo != null || hi != null || pf.promo || pf.news;
    $("#promo-section").hidden = !promos.length || !!activeCat || filtering || !!q;
    $("#new-section").hidden = !news.length || !!activeCat || filtering || !!q;
    $("#grid").innerHTML = list.slice(0, shown).map(card).join("");
    $("#count").textContent = `${list.length} ${list.length === 1 ? "item" : "itens"}`;
    $("#empty").hidden = list.length > 0;
    $("#empty-clear").hidden = !(q || activeCat || pf.min != null || pf.max != null || pf.promo || pf.news);
    $("#more").hidden = list.length <= shown;
  }
  $("#more").onclick = () => { shown += PAGE; render(); };
  $("#empty-clear").onclick = () => { $("#q").value = ""; $("#pp-clear").click(); setCategory(""); };
  render();

  /* ---------- carrinho ---------- */
  const KEY = "cat_cart_" + slug;
  var cart = {}; // var: os cartões já desenhados consultam o carrinho antes desta linha
  try { cart = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { cart = {}; }
  Object.keys(cart).forEach((c) => { if (!byCode.has(c)) delete cart[c]; }); // remove itens que saíram do catálogo
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* navegador sem armazenamento */ } };

  function addToCart(code, qty = 1, silent) {
    track("c", codeKey(code));
    cart[code] = Math.min(9999, (cart[code] || 0) + qty);
    persist(); updateCart();
    if (!silent) U.toast(`${boxOf(code) ? boxesTxt(code, cart[code]) + " (" + cart[code] + " un)" : cart[code]} no carrinho · ${byCode.get(code)?.name || ""}`);
    ["#cart-open", "#cart-float"].forEach((s) => { const el = $(s); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); });
  }

  function updateCart() {
    const codes = Object.keys(cart);
    refreshBuy();
    if ($("#pdf-ready")) $("#pdf-ready").hidden = true; // carrinho mudou: gerar de novo
    const count = codes.reduce((n, c) => n + cart[c], 0);
    $("#cart-count").textContent = count; $("#cart-count").hidden = !count;
    $("#cart-float-count").textContent = count; $("#cart-float").hidden = !count;
    // barra fixa de finalizar pedido (celular)
    const items = codes.length;
    $("#checkout-bar").hidden = !items;
    document.body.classList.toggle("has-checkout", !!items);
    $("#cb-badge").textContent = items;
    $("#cb-count").textContent = `${items} ${items === 1 ? "produto" : "produtos"} · ${count} ${count === 1 ? "unidade" : "unidades"}`;
    let total = 0, noPrice = false;
    $("#cart-list").innerHTML = codes.map((c) => {
      const p = byCode.get(c), unit = unitPrice(p);
      if (unit == null) noPrice = true; else total += unit * cart[c];
      return `<li data-code="${esc(c)}">
        ${U.imgTag(p, 160, "c-img")}
        <div class="c-info"><span class="code-row"><small>Cód. ${esc(c)}</small>${U.boxBadge(p, "sm")}</span><b>${esc(p.name || "Produto")}</b>${U.colorDots(p, 8, "sm")}
          <span>${unit != null ? U.money(unit) + " un." : canSee ? "Sem preço" : ""}</span>
          ${boxOf(c) ? `<span class="c-box">${boxesTxt(c, cart[c])} = ${cart[c]} unidades</span>` : ""}
          <div class="qty sm"><button type="button" data-step="-1" aria-label="${boxOf(c) ? "Tirar uma caixa" : "Diminuir"}">−</button><input type="number" min="1" step="1" value="${boxesOf(c, cart[c])}" aria-label="Caixas de ${esc(p.name || c)}"><button type="button" data-step="1" aria-label="Colocar mais uma caixa">+</button><span class="qty-unit">cx</span></div>
        </div>
        <div class="c-side"><strong>${unit != null ? U.money(unit * cart[c]) : ""}</strong><button type="button" class="link" data-remove aria-label="Remover ${esc(p.name || c)}">Remover</button></div>
      </li>`;
    }).join("");
    $("#cart-empty").hidden = codes.length > 0;
    $("#cart-form").hidden = !codes.length;
    $("#cart-total-row").hidden = !canSee;
    $("#cart-total").textContent = U.money(total) + (noPrice ? " +" : "");
    if (canSee) {
      // equipe: monta o orçamento com preços e escolhe o contato no WhatsApp
      $("#cart-send").disabled = false;
      $("#cart-send").textContent = "Enviar orçamento ao meu WhatsApp";
    } else {
      $("#cart-send").disabled = !wa;
      $("#cart-send").textContent = wa ? "Consultar preço pelo WhatsApp" : "Loja sem WhatsApp cadastrado";
    }
  }
  if (canSee) {
    $("#cart-hint").textContent = myWa
      ? `O orçamento vai para o seu WhatsApp: ${fmtPhone(myWa)}.`
      : "Cadastre seu WhatsApp para receber o orçamento.";
    $("#my-wa-box").hidden = !!myWa;
    $("#client-legend").textContent = "Dados do cliente";
    $("#c-name-label").textContent = "Nome ou razão social do cliente";
    $("#c-doc-label").textContent = "CNPJ do cliente";
    $("#c-phone-label").textContent = "WhatsApp do cliente";
    $("#cart-title").textContent = "Orçamento";
  }

  /* vendedores: o cliente escolhe com quem falar */
  let sellerIdx = 0;
  if (sellers.length > 1 && !canSee) {
    $("#seller-box").hidden = false;
    $("#seller-list").innerHTML = sellers.map((s, i) =>
      `<button type="button" role="radio" aria-checked="${i === 0}" data-seller="${i}">${esc(s.name)}</button>`).join("");
    $("#seller-list").addEventListener("click", (e) => {
      const b = e.target.closest("[data-seller]"); if (!b) return;
      sellerIdx = Number(b.dataset.seller);
      $$("#seller-list [data-seller]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    });
  }
  const sellerWa = () => (sellers.length ? sellers[sellerIdx].wa : wa);
  const sellerName = () => (sellers.length ? sellers[sellerIdx].name : "");

  $("#cart-list").addEventListener("click", (e) => {
    const li = e.target.closest("li"); if (!li) return;
    const c = li.dataset.code;
    if (e.target.closest("[data-remove]")) delete cart[c];
    else if (e.target.closest("[data-step]")) {
      cart[c] += Number(e.target.closest("[data-step]").dataset.step) * stepOf(c);
      if (cart[c] < 1) delete cart[c];
    } else return;
    persist(); updateCart();
  });
  $("#cart-list").addEventListener("change", (e) => {
    if (e.target.tagName !== "INPUT") return;
    const c = e.target.closest("li").dataset.code, n = Math.floor(Number(e.target.value));
    // o campo é em caixas: converte para unidades quando o produto tem Qtd. por caixa
    if (n >= 1) cart[c] = Math.min(99999, n * stepOf(c)); else delete cart[c];
    persist(); updateCart();
  });

  const drawer = $("#cart");
  const openCart = () => { updateCart(); drawer.showModal(); };
  $("#cart-open").onclick = openCart;
  $("#cart-float").onclick = openCart;
  $("#checkout-go").onclick = openCart;
  $("#cb-label").textContent = canSee ? "Montar orçamento" : "Finalizar pedido";
  // voltar ao topo em catálogos longos
  const toTop = $("#to-top");
  addEventListener("scroll", () => { toTop.hidden = scrollY < 1200; }, { passive: true });
  toTop.onclick = () => scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  $("#cart-close").onclick = () => drawer.close();
  drawer.addEventListener("click", (e) => { if (e.target === drawer) drawer.close(); });
  /* ---------- dados do cliente: nome, CNPJ e contato ---------- */
  if (!canSee) {
    // o comprador não precisa digitar de novo na próxima compra
    try {
      const raw = localStorage.getItem("cat_cliente") || "";
      const c = raw.startsWith("{") ? JSON.parse(raw) : { name: raw };
      $("#c-name").value = c.name || ""; $("#c-doc").value = c.doc || ""; $("#c-phone").value = c.phone || "";
    } catch { /* ignore */ }
  }
  const clearInvalid = (el) => el.setAttribute("aria-invalid", "false");
  $("#c-doc").addEventListener("input", (e) => { e.target.value = U.maskDoc(e.target.value); clearInvalid(e.target); });
  $("#c-phone").addEventListener("input", (e) => { e.target.value = U.maskPhone(e.target.value); clearInvalid(e.target); });
  $("#c-name").addEventListener("input", (e) => clearInvalid(e.target));
  /** Lê e confere os dados do cliente. Mostra o erro no próprio campo. */
  function readCustomer() {
    const c = { name: $("#c-name").value.trim(), doc: U.maskDoc($("#c-doc").value), phone: U.maskPhone($("#c-phone").value) };
    let bad = null, msg = "";
    if (c.name.length < 2) { bad = "#c-name"; msg = canSee ? "Informe o nome ou a razão social do cliente." : "Informe seu nome ou a razão social."; }
    else if (!U.validDoc(c.doc)) { bad = "#c-doc"; msg = c.doc ? "CNPJ inválido. Confira os números." : "Informe o CNPJ."; }
    else if (!U.validPhone(c.phone)) { bad = "#c-phone"; msg = "Informe o WhatsApp com DDD, por exemplo (11) 99999-9999."; }
    $$("#cart-form .client-box input").forEach(clearInvalid);
    $("#c-err").hidden = !bad; $("#c-err").textContent = msg;
    if (bad) { $(bad).setAttribute("aria-invalid", "true"); $(bad).focus(); U.toast(msg, "err"); return null; }
    return c;
  }
  const customerLines = (c) => [`Cliente: ${c.name}`, `${U.docLabel(c.doc)}: ${c.doc}`, `Contato: ${c.phone}`];
  $("#cart-clear").onclick = () => { if (confirm("Esvaziar o carrinho?")) { cart = {}; persist(); updateCart(); } };

  /* ---------- orçamento em PDF (equipe) ---------- */
  let pdf = null; // { file, url, summary }
  function quoteSummary(cust, number) {
    let total = 0;
    const rows = Object.keys(cart).map((c) => {
      const p = byCode.get(c), unit = unitPrice(p), q = cart[c];
      if (unit != null) total += unit * q;
      return `• ${qtyTxt(c, q)} — Cód. ${c} — ${p.name || ""}${(p.colors || []).length ? ` (cores: ${p.colors.join(", ")})` : ""}${unit != null ? ` — ${U.money(unit * q)}` : " (sem preço)"}`;
    });
    const obs = $("#c-obs").value.trim();
    return [
      `*Orçamento ${number} — ${store.name || "Catálogo"}*`, ...customerLines(cust), "",
      ...rows, "", `*Total: ${U.money(total)}*`,
      obs ? `Obs.: ${obs}` : null,
      "", `${DB.ROLE_LABEL[viewer.role] || ""}: ${viewer.name}`
    ].filter((l) => l !== null).join("\n").trim();
  }
  const quoteItems = () => Object.keys(cart).map((c) => ({ p: byCode.get(c), qty: cart[c], unit: unitPrice(byCode.get(c)) }));
  const sellerInfo = () => ({ name: viewer.name, role: DB.ROLE_LABEL[viewer.role] || "Vendedor", whatsapp: myWa });

  /** Guarda o orçamento e abre o WhatsApp do vendedor com a mensagem e o link do PDF. */
  async function sendQuote(cust, win) {
    const btn = $("#cart-send");
    btn.disabled = true; btn.textContent = "Enviando…";
    const number = Orcamento.newNumber();
    try {
      const items = quoteItems().map(({ p, qty, unit }) => ({
        code: String(p.code), name: p.name || "", category: p.category || "", images: (p.images || []).slice(0, 1), imageUrl: p.imageUrl || "", boxQty: p.boxQty || null, isNew: !!p.isNew, colors: p.colors || [],
        price: p.price ?? null, promoPrice: p.promoPrice ?? null, qty, unit
      }));
      Object.keys(cart).forEach((c) => track("o", codeKey(c), 1, true)); flushStats();
      const id = await DB.saveQuote({
        slug, ownerUid: cat.uid, sellerName: viewer.name, number, client: cust.name, clientDoc: cust.doc, clientPhone: cust.phone, obs: $("#c-obs").value.trim(), items,
        store: { name: store.name || "", whatsapp: store.whatsapp || "", instagram: store.instagram || "", accent: store.accent || "#ff6a36", logo: store.logo || "" },
        seller: sellerInfo()
      });
      const link = new URL(`orcamento.html?id=${encodeURIComponent(id)}`, location.href).href;
      const msg = `${quoteSummary(cust, number)}\n\n📄 *PDF do orçamento:*\n${link}`;
      const url = `https://wa.me/${myWa}?text=${encodeURIComponent(msg)}`;
      if (win && !win.closed) win.location.href = url; else location.href = url;
      U.toast("Orçamento enviado para o seu WhatsApp.");
    } catch (err) {
      if (win && !win.closed) win.close();
      U.toast("Não foi possível salvar o orçamento: " + err.message, "err");
    }
    btn.disabled = false; btn.textContent = "Enviar orçamento ao meu WhatsApp";
    makePdf(cust, number); // também deixa o PDF pronto para baixar/compartilhar daqui
  }

  async function makePdf(cust, number) {
    try {
      const items = quoteItems();
      const out = await Orcamento.build({ store, client: cust.name, clientDoc: cust.doc, clientPhone: cust.phone, obs: $("#c-obs").value.trim(), items, number, seller: sellerInfo() });
      if (pdf && pdf.url) URL.revokeObjectURL(pdf.url);
      const file = new File([out.blob], out.filename, { type: "application/pdf" });
      pdf = { file, url: URL.createObjectURL(out.blob), summary: quoteSummary(cust, number) };
      const canShareFile = !!(navigator.canShare && navigator.canShare({ files: [file] }));
      $("#pdf-share").hidden = !canShareFile;
      $("#pdf-download").href = pdf.url; $("#pdf-download").download = out.filename;
      $("#pdf-name").textContent = out.filename;
      $("#pdf-tip").textContent = canShareFile
        ? "O link do PDF já foi para o seu WhatsApp. Se quiser mandar o arquivo direto, toque em \"Enviar PDF\"."
        : "O link do PDF já foi para o seu WhatsApp. Se quiser, baixe o arquivo aqui.";
      $("#pdf-ready").hidden = false;
      $("#pdf-ready").scrollIntoView({ block: "nearest" });
    } catch (err) { U.toast(err.message, "err"); }
  }
  $("#pdf-share").onclick = async () => {
    if (!pdf) return;
    try { await navigator.share({ files: [pdf.file], title: pdf.file.name, text: pdf.summary.split("\n")[0].replace(/\*/g, "") }); }
    catch (e) { if (e.name !== "AbortError") U.toast("Não foi possível compartilhar. Use \"Baixar PDF\".", "err"); }
  };

  $("#cart-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const cust = readCustomer();
    if (!cust) return;
    if (canSee) {
      const typed = $("#my-wa").value.replace(/\D/g, "");
      if (!myWa && typed.length < 10) { $("#my-wa").focus(); return U.toast("Informe seu WhatsApp com DDD.", "err"); }
      // abre a aba do WhatsApp já no clique (navegadores bloqueiam abrir depois de esperar)
      const win = window.open("", "_blank");
      if (!myWa) {
        const n = typed;
        myWa = intl(n);
        if (DB.TEAM.includes(viewer.role)) { try { await DB.setMyWhatsapp(n); } catch { /* segue mesmo sem salvar */ } }
        $("#my-wa-box").hidden = true;
        $("#cart-hint").textContent = `O orçamento vai para o seu WhatsApp: ${fmtPhone(myWa)}.`;
      }
      await sendQuote(cust, win);
      return;
    }
    try { localStorage.setItem("cat_cliente", JSON.stringify(cust)); } catch { /* ignore */ }
    const boxTxt = (c) => (byCode.get(c).boxQty ? ` (cx ${byCode.get(c).boxQty})` : "");
    const lines = Object.keys(cart).map((c) => { const p = byCode.get(c); return `• ${qtyTxt(c, cart[c])} — Cód. ${c} — ${p.name || ""}${(p.colors || []).length ? ` (cores: ${p.colors.join(", ")})` : ""}`; });
    const obs = $("#c-obs").value.trim();
    const hi = sellerName() ? `Olá, ${sellerName()}!` : "Olá!";
    const msg = [
      `${hi} Gostaria de *consultar o preço* destes produtos do catálogo *${store.name || ""}*:`, "",
      ...lines, "",
      ...customerLines(cust),
      obs ? `Obs.: ${obs}` : "",
      location.href.split("#")[0]
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n").trim();
    Object.keys(cart).forEach((c) => track("o", codeKey(c), 1, true)); flushStats();
    const url = waLink(msg, sellerWa());
    if (!window.open(url, "_blank")) location.href = url;
  });
  updateCart();

  /* ---------- detalhe ---------- */
  const dlg = $("#detail");
  let current = null;
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) return addToCart(add.dataset.add, stepOf(add.dataset.add), true);
    const inc = e.target.closest("[data-inc]");
    if (inc) return addToCart(inc.dataset.inc, stepOf(inc.dataset.inc), true);
    const dec = e.target.closest("[data-dec]");
    if (dec) {
      const c = dec.dataset.dec;
      const st = stepOf(c);
      if (cart[c] > st) cart[c] -= st; else cart = Object.fromEntries(Object.entries(cart).filter(([k]) => k !== c));
      persist(); updateCart(); return;
    }
    const b = e.target.closest(".open[data-code]");
    if (b) open(byCode.get(b.dataset.code));
  });
  function open(p) {
    if (!p) return;
    track("v", codeKey(p.code));
    current = p;
    const imgs = p.images && p.images.length ? p.images : [];
    const showImg = (i) => {
      $("#d-main").innerHTML = tag(p) + (isNew(p) ? `<span class="new-tag">NOVO</span>` : "") + (imgs.length
        ? `<img src="${U.driveImg(imgs[i], 1200)}" data-fallback="${U.driveImgFallback(imgs[i], 1200)}" alt="${esc(p.name)}" referrerpolicy="no-referrer">`
        : U.imgTag(p, 1200, ""));
      $$("#d-thumbs button").forEach((t, j) => t.setAttribute("aria-current", String(i === j)));
    };
    $("#d-thumbs").innerHTML = imgs.length > 1 ? imgs.map((id, i) =>
      `<button data-i="${i}" aria-label="Foto ${i + 1}"><img src="${U.driveImg(id, 160)}" data-fallback="${U.driveImgFallback(id, 160)}" alt="" referrerpolicy="no-referrer"></button>`).join("") : "";
    $("#d-thumbs").onclick = (e) => { const t = e.target.closest("button"); if (t) showImg(Number(t.dataset.i)); };
    showImg(0);
    $("#d-code").innerHTML = `<span>Cód. ${esc(p.code)}${p.category ? " · " + esc(p.category) : ""}</span>${U.boxBadge(p, "lg")}`;
    $("#d-name").textContent = p.name || "Produto";
    $("#d-price").outerHTML = priceHtml(p, "d-price");
    $("#d-desc").textContent = p.description || "";
    $("#d-colors").innerHTML = U.colorList(p);
    $("#d-qty").value = 1;
    $("#d-unit").textContent = "cx";
    $("#d-boxhint").hidden = !p.boxQty;
    if (p.boxQty) $("#d-boxhint").textContent = `Pedido por caixa: 1 cx = ${p.boxQty} unidades.`;
    const waBtn = $("#d-wa");
    waBtn.hidden = !wa;
    if (wa) waBtn.href = waLink(`Olá! Tenho uma dúvida sobre o produto:\nCód. ${p.code} — ${p.name || ""}\n${location.href.split("#")[0]}`);
    dlg.showModal();
  }
  $$(".d-buy [data-q]").forEach((b) => b.onclick = () => {
    const i = $("#d-qty"); i.value = Math.max(1, (Number(i.value) || 1) + Number(b.dataset.q));
  });
  $("#d-add").onclick = () => {
    if (!current) return;
    const n = Math.max(1, Math.floor(Number($("#d-qty").value) || 1));
    addToCart(String(current.code), n * stepOf(current.code)); // em caixas quando o produto tem CX
    dlg.close();
  };
  $("#d-close").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  $("#loading").hidden = true; $("#app").hidden = false;
})();
