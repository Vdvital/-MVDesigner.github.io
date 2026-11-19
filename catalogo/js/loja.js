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
  const byCode = new Map(products.map((p) => [String(p.code), p]));
  document.title = store.name || "Catálogo";
  if (store.accent) document.documentElement.style.setProperty("--accent", store.accent);

  /* ---------- capa ---------- */
  const hero = $("#hero");
  if (store.cover) hero.style.backgroundImage = `url("${store.cover}")`; else hero.classList.add("no-cover");
  $("#store-name").textContent = store.name || "Catálogo";
  $("#foot-name").textContent = store.name || "";
  $("#store-about").textContent = store.about || "";
  const intl = (n) => { n = String(n || "").replace(/\D/g, ""); return n ? (n.length <= 11 ? "55" + n : n) : ""; };
  const sellers = (store.sellers || []).map((s) => ({ name: s.name || "Vendedor", wa: intl(s.whatsapp) })).filter((s) => s.wa);
  const wa = intl(store.whatsapp) || (sellers[0] && sellers[0].wa) || "";
  const waLink = (text, num = wa) => `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  $("#hero-links").innerHTML =
    (wa ? `<a href="${waLink("Olá! Vi o catálogo e gostaria de fazer um pedido.")}" target="_blank" rel="noopener">WhatsApp</a>` : "") +
    (store.instagram ? `<a href="https://instagram.com/${encodeURIComponent(store.instagram)}" target="_blank" rel="noopener">@${esc(store.instagram)}</a>` : "");
  if (wa) { const f = $("#wa-float"); f.hidden = false; f.href = waLink("Olá! Vi o catálogo e tenho uma dúvida."); }

  /* ---------- preço ---------- */
  const unitPrice = (p) => (U.discount(p) ? p.promoPrice : p.price ?? p.promoPrice ?? null);
  const priceHtml = (p, id = "") => {
    const off = U.discount(p), attr = id ? ` id="${id}"` : "";
    if (off) return `<div class="price"${attr}><span class="old">${U.money(p.price)}</span><span class="now promo">${U.money(p.promoPrice)}</span></div>`;
    const v = unitPrice(p);
    return `<div class="price"${attr}>${v != null ? `<span class="now">${U.money(v)}</span>` : `<span class="code">Consulte</span>`}</div>`;
  };
  const tag = (p) => { const off = U.discount(p); return off ? `<span class="promo-tag"><small>PROMO</small>-${off}%</span>` : ""; };

  /* ---------- card ---------- */
  const card = (p) => `
    <article class="item${U.discount(p) ? " is-promo" : ""}">
      ${tag(p)}
      <button class="open" data-code="${esc(p.code)}" aria-label="Ver detalhes de ${esc(p.name || p.code)}">
        ${U.imgTag(p, 500, "ph")}
        <div class="body"><span class="code">Cód. ${esc(p.code)}</span><span class="name">${esc(p.name || "Produto")}</span>${priceHtml(p)}</div>
      </button>
      <button class="add" data-add="${esc(p.code)}">+ Adicionar</button>
    </article>`;

  /* ---------- promoções ---------- */
  const promos = products.filter((p) => U.discount(p));
  if (promos.length) { $("#promo-section").hidden = false; $("#promo-row").innerHTML = promos.map(card).join(""); }

  /* ---------- categorias ---------- */
  const cats = [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  let activeCat = "", shown = PAGE;
  const chips = $("#chips");
  chips.innerHTML = ["", ...cats].map((c) => `<button aria-pressed="${c === "" ? "true" : "false"}" data-cat="${esc(c)}">${c ? esc(c) : "Todos"}</button>`).join("");
  if (!cats.length) { $(".chips-wrap").hidden = true; $("#tab-categorias").hidden = true; }

  $("#cat-grid").innerHTML = cats.map((c) => {
    const items = products.filter((p) => p.category === c);
    const withImg = items.find((p) => p.images?.length || p.imageUrl) || items[0];
    const promo = items.filter((p) => U.discount(p)).length;
    return `<button class="cat-card" data-cat="${esc(c)}">
      ${U.imgTag(withImg, 400, "cat-img")}
      <span class="cat-info"><b>${esc(c)}</b><small>${items.length} ${items.length === 1 ? "produto" : "produtos"}${promo ? ` · <em>${promo} em promoção</em>` : ""}</small></span>
    </button>`;
  }).join("");

  function setCategory(c) {
    activeCat = c; shown = PAGE;
    $$("#chips button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.cat === c)));
    $("#all-label").textContent = c || "Produtos";
    $("#promo-section").hidden = !promos.length || !!c;
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
    $(".chips-wrap").hidden = v !== "produtos" || !cats.length;
  }
  $(".tabs").addEventListener("click", (e) => { const t = e.target.closest("[role=tab]"); if (t) showView(t.dataset.view); });

  /* ---------- busca e lista ---------- */
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  $("#q").addEventListener("input", () => { shown = PAGE; showView("produtos"); render(); });

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

  /* ---------- carrinho ---------- */
  const KEY = "cat_cart_" + slug;
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { cart = {}; }
  Object.keys(cart).forEach((c) => { if (!byCode.has(c)) delete cart[c]; }); // remove itens que saíram do catálogo
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* navegador sem armazenamento */ } };

  function addToCart(code, qty = 1, btn) {
    cart[code] = Math.min(9999, (cart[code] || 0) + qty);
    persist(); updateCart();
    U.toast(`Adicionado ao carrinho (${cart[code]})`);
    if (btn) { btn.classList.add("added"); btn.textContent = "✓ Adicionado"; setTimeout(() => { btn.classList.remove("added"); btn.textContent = "+ Adicionar"; }, 1200); }
    ["#cart-open", "#cart-float"].forEach((s) => { const el = $(s); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); });
  }

  function updateCart() {
    const codes = Object.keys(cart);
    const count = codes.reduce((n, c) => n + cart[c], 0);
    $("#cart-count").textContent = count; $("#cart-count").hidden = !count;
    $("#cart-float-count").textContent = count; $("#cart-float").hidden = !count;
    let total = 0, noPrice = false;
    $("#cart-list").innerHTML = codes.map((c) => {
      const p = byCode.get(c), unit = unitPrice(p);
      if (unit == null) noPrice = true; else total += unit * cart[c];
      return `<li data-code="${esc(c)}">
        ${U.imgTag(p, 160, "c-img")}
        <div class="c-info"><small>Cód. ${esc(c)}</small><b>${esc(p.name || "Produto")}</b>
          <span>${unit != null ? U.money(unit) + " un." : "Consulte"}</span>
          <div class="qty sm"><button type="button" data-step="-1" aria-label="Diminuir">−</button><input type="number" min="1" value="${cart[c]}" aria-label="Quantidade de ${esc(p.name || c)}"><button type="button" data-step="1" aria-label="Aumentar">+</button></div>
        </div>
        <div class="c-side"><strong>${unit != null ? U.money(unit * cart[c]) : ""}</strong><button type="button" class="link" data-remove aria-label="Remover ${esc(p.name || c)}">Remover</button></div>
      </li>`;
    }).join("");
    $("#cart-empty").hidden = codes.length > 0;
    $("#cart-form").hidden = !codes.length;
    $("#cart-total").textContent = total ? U.money(total) + (noPrice ? " +" : "") : "A consultar";
    $("#cart-send").disabled = !wa;
    $("#cart-send").textContent = wa ? "Consultar preço pelo WhatsApp" : "Loja sem WhatsApp cadastrado";
  }

  /* vendedores: o cliente escolhe com quem falar */
  let sellerIdx = 0;
  if (sellers.length > 1) {
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
      cart[c] += Number(e.target.closest("[data-step]").dataset.step);
      if (cart[c] < 1) delete cart[c];
    } else return;
    persist(); updateCart();
  });
  $("#cart-list").addEventListener("change", (e) => {
    if (e.target.tagName !== "INPUT") return;
    const c = e.target.closest("li").dataset.code, n = Math.floor(Number(e.target.value));
    if (n >= 1) cart[c] = Math.min(9999, n); else delete cart[c];
    persist(); updateCart();
  });

  const drawer = $("#cart");
  const openCart = () => { updateCart(); drawer.showModal(); };
  $("#cart-open").onclick = openCart;
  $("#cart-float").onclick = openCart;
  $("#cart-close").onclick = () => drawer.close();
  drawer.addEventListener("click", (e) => { if (e.target === drawer) drawer.close(); });
  try { $("#c-name").value = localStorage.getItem("cat_cliente") || ""; } catch { /* ignore */ }
  $("#cart-clear").onclick = () => { if (confirm("Esvaziar o carrinho?")) { cart = {}; persist(); updateCart(); } };

  $("#cart-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#c-name").value.trim();
    if (!name) { $("#c-name").focus(); return U.toast("Informe seu nome.", "err"); }
    try { localStorage.setItem("cat_cliente", name); } catch { /* ignore */ }
    const lines = Object.keys(cart).map((c) => `• ${cart[c]}x — Cód. ${c} — ${byCode.get(c).name || ""}`);
    const obs = $("#c-obs").value.trim();
    const hi = sellerName() ? `Olá, ${sellerName()}!` : "Olá!";
    const msg = [
      `${hi} Gostaria de *consultar o preço* destes produtos do catálogo *${store.name || ""}*:`, "",
      ...lines, "",
      `Cliente: ${name}`,
      obs ? `Obs.: ${obs}` : "",
      location.href.split("#")[0]
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n").trim();
    const url = waLink(msg, sellerWa());
    if (!window.open(url, "_blank")) location.href = url;
  });
  updateCart();

  /* ---------- detalhe ---------- */
  const dlg = $("#detail");
  let current = null;
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) return addToCart(add.dataset.add, 1, add);
    const b = e.target.closest(".open[data-code]");
    if (b) open(byCode.get(b.dataset.code));
  });
  function open(p) {
    if (!p) return;
    current = p;
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
    $("#d-price").outerHTML = priceHtml(p, "d-price");
    $("#d-desc").textContent = p.description || "";
    $("#d-qty").value = 1;
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
    addToCart(String(current.code), Math.max(1, Math.floor(Number($("#d-qty").value) || 1)));
    dlg.close();
  };
  $("#d-close").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  $("#loading").hidden = true; $("#app").hidden = false;
})();
