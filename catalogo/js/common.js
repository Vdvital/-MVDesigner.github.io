/* Utilidades compartilhadas: interface, dinheiro, datas, Google Drive, imagens e Excel. */
(function () {
  const CFG = window.CATALOGO_CONFIG || {};
  const U = {};

  U.$ = (s, el = document) => el.querySelector(s);
  U.$$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  U.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  U.toast = (msg, type = "ok") => {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("role", "status"); document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast " + type; t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add("out"), 3800);
    setTimeout(() => t.remove(), 4300);
  };

  /** Aviso com um botão (ex.: "Desfazer"). O botão some depois de alguns segundos. */
  U.toastAction = (msg, label, onClick, ms = 7000) => {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("role", "status"); document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast action";
    t.innerHTML = `<span></span><button type="button"></button>`;
    t.querySelector("span").textContent = msg;
    const b = t.querySelector("button"); b.textContent = label;
    const close = () => { t.classList.add("out"); setTimeout(() => t.parentNode && t.parentNode.removeChild(t), 450); };
    b.onclick = () => { close(); onClick(); };
    box.appendChild(t);
    setTimeout(close, ms);
  };

  /* ---------- dinheiro e datas ---------- */
  U.parseMoney = (v) => {
    if (typeof v === "number") return isFinite(v) ? v : null;
    let s = String(v ?? "").replace(/[^\d,.-]/g, "").trim();
    if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  };
  /** Fator de preço da loja: preço do catálogo = preço cadastrado × fator, com arredondamento opcional. */
  U.FATOR_PADRAO = { fator: 1, arred: "centavo" };
  U.fatorAtivo = (aj) => !!aj && Number(aj.fator) > 0 && Number(aj.fator) !== 1;
  U.aplicaFator = (v, aj) => {
    if (v == null || v === "" || !U.fatorAtivo(aj)) return v;
    const x = Number(v) * Number(aj.fator);
    if (aj.arred === "inteiro") return Math.ceil(x - 1e-9);
    if (aj.arred === "90") { const f = Math.floor(x); return x - f <= 0.9 + 1e-9 ? f + 0.9 : f + 1.9; }
    return Math.round(x * 100) / 100;
  };
  U.fatorTxt = (n) => `${String(Number(n)).replace(".", ",")}×`;
  /* ---------- Pedido mínimo da loja ---------- */
  U.MIN_TIPOS = {
    valor: { label: "Valor em R$", um: "", fmt: (n) => U.money(n) },
    caixas: { label: "Caixas", um: ["caixa", "caixas"] },
    pecas: { label: "Peças (unidades)", um: ["peça", "peças"] },
    itens: { label: "Produtos diferentes", um: ["produto diferente", "produtos diferentes"] }
  };
  U.minimoAtivo = (m) => !!m && m.ativo && Number(m.valor) > 0 && !!U.MIN_TIPOS[m.tipo];
  U.minimoQtd = (m, n) => {
    const t = U.MIN_TIPOS[m.tipo]; n = Number(n);
    if (m.tipo === "valor") return U.money(n);
    const v = Number.isInteger(n) ? n : Math.ceil(n);
    return `${v.toLocaleString("pt-BR")} ${v === 1 ? t.um[0] : t.um[1]}`;
  };
  /** Texto curto: "Pedido mínimo: 10 caixas". Usa a mensagem da loja se houver. */
  U.minimoTxt = (m) => (m.msg && m.msg.trim()) || `Pedido mínimo: ${U.minimoQtd(m, m.valor)}`;
  /** Confere o carrinho. tot = { valor, valorOk, caixas, pecas, itens } */
  U.minimoCheck = (m, tot) => {
    if (!U.minimoAtivo(m)) return { ativo: false, ok: true };
    const alvo = Number(m.valor);
    if (m.tipo === "valor" && !tot.valorOk) return { ativo: true, ok: true, semPreco: true, alvo };
    const atual = Number(tot[m.tipo] || 0);
    const falta = Math.max(0, alvo - atual);
    return { ativo: true, ok: falta <= 1e-9, falta, atual, alvo, pct: Math.min(100, (atual / alvo) * 100) };
  };
  U.money = (n) => (n == null || n === "" ? "" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  U.date = (ms) => (ms ? new Date(ms).toLocaleDateString("pt-BR") : "—");
  U.dateTime = (ms) => (ms ? new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "nunca");
  U.daysLeft = (ms) => (ms ? Math.ceil((ms - Date.now()) / 86400000) : null);
  U.inputDate = (ms) => { if (!ms) return ""; const d = new Date(ms); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  U.endOfDay = (yyyyMmDd) => { const [y, m, d] = yyyyMmDd.split("-").map(Number); return new Date(y, m - 1, d, 23, 59, 59).getTime(); };

  /** Quantidade por caixa: aceita 12, "12", "cx 12", "12 un" → 12 (ou null). */
  U.parseBox = (v) => {
    const m = String(v ?? "").match(/\d+/);
    const n = m ? parseInt(m[0], 10) : NaN;
    return n > 0 && n < 100000 ? n : null;
  };
  const BOX_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M12 2.8 20.5 7v10L12 21.2 3.5 17V7L12 2.8Z"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M3.5 7 12 11.2 20.5 7M12 11.2v10M7.8 4.9l8.5 4.2"/></svg>';
  /** Selo "caixa com N unidades" (ícone de caixa + CX N). */
  U.boxBadge = (p, cls = "") => p && p.boxQty
    ? `<span class="box-qty ${cls}" title="Caixa com ${p.boxQty} unidades">${BOX_SVG}<span>CX ${p.boxQty}</span><span class="sr-only"> (caixa com ${p.boxQty} unidades)</span></span>`
    : "";

  /* ---------- dados do cliente no pedido ---------- */
  const digits = (v) => String(v ?? "").replace(/\D/g, "");
  /** Máscara de CNPJ (ou CPF, se tiver até 11 números). */
  U.maskDoc = (v) => {
    const d = digits(v).slice(0, 14);
    if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
    return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  };
  /** Confere os dígitos verificadores do CNPJ (14 números) ou CPF (11 números). */
  U.validDoc = (v) => {
    const d = digits(v);
    if (/^(\d)\1+$/.test(d)) return false;
    if (d.length === 14) {
      const calc = (n) => { let s = 0, w = n - 7; for (let i = 0; i < n; i++) { s += +d[i] * w--; if (w < 2) w = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
      return calc(12) === +d[12] && calc(13) === +d[13];
    }
    if (d.length === 11) {
      const calc = (n) => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
      return calc(9) === +d[9] && calc(10) === +d[10];
    }
    return false;
  };
  U.docLabel = (v) => (digits(v).length === 11 ? "CPF" : "CNPJ");
  /** Máscara de telefone: (11) 99999-9999. */
  U.maskPhone = (v) => {
    const d = digits(v).replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  U.validPhone = (v) => { const d = digits(v); return d.length === 10 || d.length === 11; };

  /** Etiquetas do produto. Aceita "Novidade", "Novo", "Lançamento", "Promoção", "Promo", "Oferta" (juntas ou separadas). */
  U.parseTags = (v) => {
    const t = String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return { isNew: /novidade|\bnovo\b|\bnova\b|lancamento|new/.test(t), tagPromo: /promo|oferta|liquida/.test(t) };
  };
  /* ---------- cores do produto (variações sortidas) ---------- */
  const COLOR_MAP = {
    "preto": "#1b1b1b", "branco": "#ffffff", "cinza": "#9a9a9a", "cinza claro": "#cfcfcf", "cinza escuro": "#5c5c5c", "grafite": "#3d4145", "chumbo": "#4a4e52",
    "vermelho": "#d62828", "vinho": "#7b1e2b", "bordo": "#7b1e2b", "bordô": "#7b1e2b", "rosa": "#f4a6c0", "rosa claro": "#f9cfdc", "rosa bebe": "#f9cfdc", "rosa bebê": "#f9cfdc", "pink": "#ff3e9a", "magenta": "#d6247f", "fucsia": "#d6247f", "fúcsia": "#d6247f",
    "laranja": "#ff7a1a", "coral": "#ff6f61", "salmao": "#fa8072", "salmão": "#fa8072", "pessego": "#ffcba4", "pêssego": "#ffcba4",
    "amarelo": "#ffd60a", "amarelo claro": "#fff3a3", "mostarda": "#d8a31a", "dourado": "#c9a227", "ouro": "#c9a227", "cobre": "#b87333", "bronze": "#a97142",
    "verde": "#2e9e4f", "verde claro": "#8fd694", "verde limao": "#a6e22e", "verde limão": "#a6e22e", "verde escuro": "#1f5f3a", "verde musgo": "#5b6b2f", "verde agua": "#7fd1c2", "verde água": "#7fd1c2", "menta": "#98e2c6", "oliva": "#708238",
    "azul": "#1e6bd6", "azul claro": "#8ec5ff", "azul bebe": "#bfe0ff", "azul bebê": "#bfe0ff", "azul marinho": "#1b2a4a", "marinho": "#1b2a4a", "azul royal": "#2547c8", "turquesa": "#30c5c0", "tiffany": "#81d8d0", "ciano": "#00b7d6", "petroleo": "#1f5c66", "petróleo": "#1f5c66",
    "roxo": "#6f3fb3", "lilas": "#c3a6e6", "lilás": "#c3a6e6", "lavanda": "#b9a7e8", "violeta": "#8f4fd1", "uva": "#5a2a6e",
    "marrom": "#7a4b2a", "cafe": "#5a3a24", "café": "#5a3a24", "chocolate": "#5a3a24", "caramelo": "#b5733a", "bege": "#e6d3b3", "nude": "#e3bfa3", "creme": "#f5ecd7", "off white": "#f4f1ea", "areia": "#d9c7a7", "natural": "#e8dcc4", "madeira": "#a9764a", "terracota": "#c0613c",
    "prata": "#c0c4c8", "prateado": "#c0c4c8", "inox": "#b9bec3", "transparente": "transparent", "cristal": "transparent", "colorido": "multi", "sortido": "multi", "sortidas": "multi", "estampado": "multi"
  };
  const colorKey = (n) => String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
  const COLOR_MAP_N = Object.fromEntries(Object.entries(COLOR_MAP).map(([k, v]) => [colorKey(k), v]));
  /** "#1e6bd6", "transparent", "multi" ou "" (desconhecida). */
  U.colorHex = (name) => {
    const n = String(name || "").trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(n)) return n;
    const k = colorKey(n);
    if (COLOR_MAP_N[k]) return COLOR_MAP_N[k];
    // "azul petróleo escuro" → usa a primeira palavra conhecida
    const first = Object.keys(COLOR_MAP_N).filter((c) => k.startsWith(c + " ") || k === c).sort((a, b) => b.length - a.length)[0];
    return first ? COLOR_MAP_N[first] : "";
  };
  /** Lê "Azul, Rosa / Verde; lilás" → ["Azul", "Rosa", "Verde", "Lilás"]. */
  U.parseColors = (v) => [...new Set(String(v ?? "").split(/[,;\/|\n]+| e (?=[a-záéíóúâêôãõç])/i)
    .map((c) => c.trim()).filter(Boolean)
    .map((c) => c.charAt(0).toUpperCase() + c.slice(1)))].slice(0, 24);
  U.COMMON_COLORS = ["Preto", "Branco", "Cinza", "Vermelho", "Rosa", "Pink", "Laranja", "Amarelo", "Verde", "Azul", "Azul marinho", "Lilás", "Roxo", "Marrom", "Bege", "Dourado", "Prata", "Transparente"];
  const swatch = (c, size) => {
    const h = U.colorHex(c);
    const style = h === "multi" ? "background:conic-gradient(#d62828,#ffd60a,#2e9e4f,#1e6bd6,#6f3fb3,#d62828)"
      : h === "transparent" ? "background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/6px 6px"
      : h ? `background:${h}` : "background:repeating-linear-gradient(45deg,#bbb 0 2px,#eee 2px 4px)";
    return `<span class="sw${size ? " " + size : ""}" style="${style}" title="${U.esc(c)}"></span>`;
  };
  U.swatch = swatch;
  /** Bolinhas de cor (até `max`, depois "+N"). */
  U.colorDots = (p, max = 6, cls = "") => {
    const cs = (p && p.colors) || [];
    if (!cs.length) return "";
    const shown = cs.slice(0, max), rest = cs.length - shown.length;
    return `<span class="color-dots ${cls}" role="img" aria-label="Cores: ${U.esc(cs.join(", "))}">${shown.map((c) => swatch(c)).join("")}${rest > 0 ? `<b>+${rest}</b>` : ""}</span>`;
  };
  /** Lista com bolinha + nome (página do produto). */
  U.colorList = (p) => {
    const cs = (p && p.colors) || [];
    if (!cs.length) return "";
    return `<div class="color-list"><span class="cl-title">${cs.length > 1 ? (p.boxQty ? "Cores sortidas na caixa" : "Cores disponíveis") : "Cor"}</span>
      <ul>${cs.map((c) => `<li>${swatch(c, "lg")}<span>${U.esc(c)}</span></li>`).join("")}</ul></div>`;
  };
  U.colorsText = (p) => ((p && p.colors) || []).join(", ");

  U.tagText = (p) => [p.isNew && "Novidade", p.tagPromo && "Promoção"].filter(Boolean).join(", ");

  U.discount = (p) => (p.promoPrice && p.price && p.promoPrice < p.price ? Math.round((1 - p.promoPrice / p.price) * 100) : 0);

  /* ---------- autenticação nas páginas ---------- */
  /** Página inicial de cada tipo de conta. */
  U.homeFor = (me) => me.role === "admin" ? "admin.html"
    : DB.TEAM.includes(me.role) ? `loja.html?loja=${encodeURIComponent(me.slug)}` : "painel.html";

  /** Marca quem está usando o sistema: "online agora" e uma entrada por dia (só para o painel do admin). */
  U.presence = (me) => {
    if (!me || me.role === "admin" || U._presence) return;
    const ping = () => {
      if (document.hidden) return;
      const day = new Date().toISOString().slice(0, 10), k = `cat_seen_${me.uid}`;
      let first = false;
      try { first = localStorage.getItem(k) !== day; if (first) localStorage.setItem(k, day); } catch { first = false; }
      DB.seen(me, first).catch(() => { try { if (first) localStorage.removeItem(k); } catch { /* ignore */ } });
    };
    ping();
    U._presence = setInterval(ping, 120000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) ping(); });
  };

  /* ---------- Aviso do administrador ---------- */
  U.AVISO_TIPOS = {
    novidade: { icon: "🎉", label: "Novidade" },
    info: { icon: "ℹ️", label: "Informação" },
    manutencao: { icon: "🛠️", label: "Manutenção" },
    importante: { icon: "⚠️", label: "Importante" }
  };
  U.avisoValido = (a, me) => !!a && a.ativo && (!a.expiresAt || a.expiresAt > Date.now())
    && (!me || a.publico !== "donos" || me.role === "user");
  /** Monta o HTML do aviso (também usado na pré-visualização do admin). */
  U.avisoHtml = (a, closable = true) => {
    const t = U.AVISO_TIPOS[a.tipo] || U.AVISO_TIPOS.info;
    const link = a.linkUrl && /^https?:\/\//i.test(a.linkUrl) ? `<a class="av-link" href="${U.esc(a.linkUrl)}" target="_blank" rel="noopener">${U.esc(a.linkTexto || "Saiba mais")} →</a>` : "";
    return `<span class="av-ic" aria-hidden="true">${t.icon}</span>
      <div class="av-body"><small>${t.label} · Aviso do Catálogo Online</small>${a.titulo ? `<b>${U.esc(a.titulo)}</b>` : ""}<p>${U.esc(a.texto || "")}</p>${link}</div>
      ${closable && a.tipo !== "importante" ? `<button type="button" class="av-close" aria-label="Fechar aviso">Entendi</button>` : ""}`;
  };
  /** Mostra o aviso ativo para a loja/equipe; "Entendi" esconde até sair um aviso novo. */
  U.showAviso = async (el, me) => {
    if (!el) return;
    let a = null; try { a = await DB.getAviso(); } catch { return; }
    if (!U.avisoValido(a, me)) { el.hidden = true; return; }
    const key = `cat_aviso_ok_${me ? me.uid : ""}`;
    try { if (localStorage.getItem(key) === String(a.id)) return; } catch { /* mostra */ }
    el.className = `aviso-banner t-${a.tipo || "info"}`;
    el.setAttribute("role", a.tipo === "importante" ? "alert" : "status");
    el.innerHTML = U.avisoHtml(a);
    el.hidden = false;
    const close = el.querySelector(".av-close");
    if (close) close.onclick = () => { try { localStorage.setItem(key, String(a.id)); } catch { /* ignore */ } el.hidden = true; };
  };

  U.requireLogin = async (role) => {
    const me = await DB.current();
    if (!me) { location.replace("index.html"); return null; }
    if (DB.TEAM.includes(me.role)) { location.replace(U.homeFor(me)); return null; }
    if (role === "admin" && me.role !== "admin") { location.replace("painel.html"); return null; }
    if (me.role !== "admin" && DB.accessStatus(me) !== "ativo") { await DB.logout(); location.replace("index.html?expirado=1"); return null; }
    U.presence(me);
    return me;
  };

  U.modeBanner = () => {
    if (DB.mode !== "local") return;
    const b = document.createElement("div");
    b.className = "mode-banner";
    b.innerHTML = "<strong>Modo de teste:</strong> os dados ficam só neste navegador. Para clientes acessarem de qualquer lugar, ative o Firebase em <code>config.js</code>.";
    document.body.prepend(b);
  };

  /* ---------- Google Drive ---------- */
  U.driveFolderId = (input) => {
    const s = String(input || "").trim();
    const m = s.match(/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
    if (m) return m[1];
    return /^[\w-]{10,}$/.test(s) ? s : "";
  };

  U.driveImg = (id, w = 800) => `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w${w}`;
  U.driveImgFallback = (id, w = 800) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;

  /** Lista todas as imagens de uma pasta pública do Drive (e de subpastas, 1 nível). */
  U.driveList = async (folderId) => {
    if (!CFG.googleApiKey) throw new Error("Falta a chave da API do Google em config.js (googleApiKey).");
    const list = async (parent, mimeFilter) => {
      let files = [], token = "";
      do {
        const q = encodeURIComponent(`'${parent}' in parents and trashed=false and ${mimeFilter}`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${encodeURIComponent(CFG.googleApiKey)}${token ? "&pageToken=" + token : ""}`;
        const r = await fetch(url);
        const j = await r.json();
        if (!r.ok) {
          const msg = j.error && j.error.message ? j.error.message : r.statusText;
          if (r.status === 404) throw new Error("Pasta não encontrada. Compartilhe-a como \"Qualquer pessoa com o link\".");
          throw new Error("Google Drive: " + msg);
        }
        files = files.concat(j.files || []);
        token = j.nextPageToken || "";
      } while (token);
      return files;
    };
    const images = await list(folderId, "mimeType contains 'image/'");
    const subfolders = await list(folderId, "mimeType = 'application/vnd.google-apps.folder'");
    for (const f of subfolders) images.push(...(await list(f.id, "mimeType contains 'image/'")));
    return images;
  };

  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "").trim();

  /**
   * Liga cada produto às fotos cujo nome começa com o código.
   * Ex.: código 1020 → "1020.jpg", "1020_2.jpg", "1020-azul.png", "1020 (3).jpg".
   */
  U.matchImages = (products, files) => {
    const byBase = files.map((f) => ({ id: f.id, name: f.name, base: norm(f.name.replace(/\.[^.]+$/, "")) }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
    let matched = 0;
    const out = products.map((p) => {
      const code = norm(p.code);
      if (!code) return p;
      const imgs = byBase.filter((f) => f.base === code || (f.base.startsWith(code) && /^[_\-.(]/.test(f.base.slice(code.length))))
        .map((f) => f.id);
      if (imgs.length) matched++;
      return { ...p, images: imgs };
    });
    return { products: out, matched };
  };

  U.productImage = (p, w = 800) => {
    if (p.images && p.images.length) return U.driveImg(p.images[0], w);
    return p.imageUrl || "";
  };

  /** <img> com plano B caso o link do Drive falhe. */
  U.imgTag = (p, w, cls = "") => {
    if (p.images && p.images.length) {
      const id = U.esc(p.images[0]);
      return `<img class="${cls}" src="${U.driveImg(p.images[0], w)}" data-fallback="${U.driveImgFallback(p.images[0], w)}" alt="${U.esc(p.name)}" loading="lazy" referrerpolicy="no-referrer" data-id="${id}">`;
    }
    if (p.imageUrl) return `<img class="${cls}" src="${U.esc(p.imageUrl)}" alt="${U.esc(p.name)}" loading="lazy" referrerpolicy="no-referrer">`;
    return `<div class="${cls} no-img" aria-hidden="true">${U.esc((p.code || "?").toString().slice(0, 8))}</div>`;
  };
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && img.dataset.fallback && !img.dataset.tried) { img.dataset.tried = "1"; img.src = img.dataset.fallback; }
  }, true);

  /* ---------- imagens (capa) ---------- */
  U.compressImage = (file, maxW = 1600, quality = 0.78) => new Promise((ok, fail) => {
    if (!file.type.startsWith("image/")) return fail(new Error("Escolha um arquivo de imagem."));
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => fail(new Error("Não foi possível ler a imagem."));
    img.src = URL.createObjectURL(file);
  });

  /** Logo/ícone: imagem quadrada (encaixada, fundo transparente) em PNG pequeno. */
  U.squareIcon = (file, size = 192) => new Promise((ok, fail) => {
    if (!file.type.startsWith("image/")) return fail(new Error("Escolha um arquivo de imagem."));
    if (file.size > 8 * 1024 * 1024) return fail(new Error("Imagem muito grande (máximo 8 MB)."));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const ctx = c.getContext("2d");
      const w = img.naturalWidth || size, h = img.naturalHeight || size;
      const s = Math.min(size / w, size / h);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, (size - w * s) / 2, (size - h * s) / 2, w * s, h * s);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL("image/png"));
    };
    img.onerror = () => fail(new Error("Não foi possível ler a imagem."));
    img.src = URL.createObjectURL(file);
  });

  /** Troca o ícone da aba do navegador (favicon) e o ícone de atalho no celular. */
  U.setFavicon = (dataUrl) => {
    if (!dataUrl) return;
    [["icon", "image/png"], ["apple-touch-icon", ""]].forEach(([rel, type]) => {
      let l = document.querySelector(`link[rel="${rel}"]`);
      if (!l) { l = document.createElement("link"); l.rel = rel; document.head.appendChild(l); }
      if (type) l.type = type;
      l.href = dataUrl;
    });
  };

  /* ---------- Excel (SheetJS) ---------- */
  let xlsxPromise;
  U.loadXLSX = () => (xlsxPromise = xlsxPromise || new Promise((ok, fail) => {
    if (window.XLSX) return ok(window.XLSX);
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = () => ok(window.XLSX);
    s.onerror = () => { xlsxPromise = null; fail(new Error("Não foi possível carregar o leitor de Excel. Verifique a internet.")); };
    document.head.appendChild(s);
  }));

  const COLS = [
    { key: "code", label: "Código", alias: ["codigo", "cod", "cód", "sku", "ref", "referencia", "referência", "código"] },
    { key: "name", label: "Nome", alias: ["nome", "produto", "descricao curta", "titulo", "título", "item"] },
    { key: "description", label: "Descrição", alias: ["descricao", "descrição", "detalhes", "obs", "observacao"] },
    { key: "category", label: "Categoria", alias: ["categoria", "linha", "grupo", "departamento"] },
    { key: "price", label: "Preço", alias: ["preco", "preço", "valor", "preco normal", "preço normal", "de"] },
    { key: "promoPrice", label: "Preço promocional", alias: ["preco promocional", "preço promocional", "promocao", "promoção", "promo", "por", "oferta"] },
    { key: "colors", label: "Cores", alias: ["cores", "cor", "cores sortidas", "cor sortida", "variacao", "variação", "variacoes", "variações", "variacao de cor", "variação de cor", "cores disponiveis", "cores disponíveis", "colors", "color"] },
    { key: "tags", label: "Tag", alias: ["tag", "tags", "etiqueta", "etiquetas", "selo", "selos", "destaque", "novidade/promoção", "novidade/promocao", "novidade ou promoção"] },
    { key: "boxQty", label: "Qtd. por caixa", alias: ["qtd por caixa", "quantidade por caixa", "qtd caixa", "quantidade caixa", "qtd cx", "caixa", "cx", "caixa com", "embalagem", "master", "unidades por caixa", "un por caixa", "qtde caixa"] },
    { key: "imageUrl", label: "Link da imagem", alias: ["imagem", "link da imagem", "foto", "url"] }
  ];
  const headerKey = (h) => {
    const n = norm(h).replace(/[_\-]/g, "");
    const col = COLS.find((c) => c.alias.concat(c.label).some((a) => norm(a).replace(/[_\-]/g, "") === n));
    return col ? col.key : null;
  };

  U.readProductsFromExcel = async (file) => {
    const XLSX = await U.loadXLSX();
    const wb = XLSX.read(await file.arrayBuffer());
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rows.length) throw new Error("A planilha está vazia.");
    const map = {};
    Object.keys(rows[0]).forEach((h) => { const k = headerKey(h); if (k && !map[k]) map[k] = h; });
    if (!map.code) throw new Error("Não encontrei a coluna \"Código\" na planilha. Baixe o modelo para ver o formato.");
    return rows.map((r) => ({
      code: String(r[map.code] ?? "").trim(),
      name: String(r[map.name] ?? "").trim(),
      description: String(r[map.description] ?? "").trim(),
      category: String(r[map.category] ?? "").trim(),
      price: U.parseMoney(r[map.price]),
      promoPrice: U.parseMoney(r[map.promoPrice]),
      imageUrl: String(r[map.imageUrl] ?? "").trim(),
      // sem a coluna na planilha, mantém a quantidade por caixa que já estava cadastrada
      ...(map.boxQty ? { boxQty: U.parseBox(r[map.boxQty]) } : {}),
      // coluna Tag: "Novidade", "Promoção" ou as duas (sem a coluna, mantém o que já estava marcado)
      ...(map.tags ? U.parseTags(r[map.tags]) : {}),
      // coluna Cores: "Azul, Rosa, Verde" (sem a coluna, mantém as cores já cadastradas)
      ...(map.colors ? { colors: U.parseColors(r[map.colors]) } : {}),
      images: []
    })).filter((p) => p.code);
  };

  U.exportProductsToExcel = async (products, filename) => {
    const XLSX = await U.loadXLSX();
    const data = products.map((p) => ({
      "Código": p.code, "Nome": p.name, "Descrição": p.description, "Categoria": p.category,
      "Preço": p.price ?? "", "Preço promocional": p.promoPrice ?? "",
      "Qtd. por caixa": p.boxQty ?? "",
      "Tag": U.tagText(p),
      "Cores": U.colorsText(p),
      "Link da imagem": p.images && p.images.length ? U.driveImg(p.images[0], 1200) : (p.imageUrl || "")
    }));
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ "Código": "1020", "Nome": "Garrafa térmica 1L", "Descrição": "Aço inox, mantém a temperatura por 12h", "Categoria": "Utilidades", "Preço": 89.9, "Preço promocional": 69.9, "Qtd. por caixa": 12, "Tag": "Novidade, Promoção", "Cores": "Azul, Rosa, Verde, Lilás", "Link da imagem": "" }]);
    ws["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 44 }, { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 15 }, { wch: 20 }, { wch: 28 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produtos");
    XLSX.writeFile(wb, filename);
  };

  /**
   * Caixa de diálogo no visual do sistema (substitui confirm/prompt do navegador).
   * U.ask({ title, text, ok, cancel, danger, input: { value, placeholder, type, inputmode } })
   * → confirmação: true/false · com input: texto digitado ou null
   */
  U.ask = (o = {}) => new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "ask";
    d.setAttribute("aria-labelledby", "ask-title");
    d.innerHTML = `<form method="dialog">
      <h2 id="ask-title">${U.esc(o.title || "Confirmar")}</h2>
      ${o.text ? `<p class="ask-text">${U.esc(o.text)}</p>` : ""}
      ${o.input ? `<input class="ask-input" type="${o.input.type || "text"}" inputmode="${o.input.inputmode || "text"}" placeholder="${U.esc(o.input.placeholder || "")}" value="${U.esc(o.input.value || "")}" aria-label="${U.esc(o.title || "")}">` : ""}
      <div class="dialog-actions">
        <button class="btn ghost" value="cancel" formnovalidate>${U.esc(o.cancel || "Cancelar")}</button>
        <button class="btn ${o.danger ? "danger-solid" : "primary"}" value="ok">${U.esc(o.ok || "Confirmar")}</button>
      </div></form>`;
    document.body.appendChild(d);
    const input = d.querySelector(".ask-input");
    d.addEventListener("close", () => {
      const ok = d.returnValue === "ok";
      resolve(o.input ? (ok ? input.value : null) : ok);
      d.parentNode.removeChild(d);
    });
    d.showModal();
    if (input) { input.focus(); input.select(); }
  });

  /* ---------- renovação do plano ---------- */
  const REN = Object.assign({ whatsapp: "11993975886", avisoDias: 7 }, CFG.renovacao || {});
  U.renewDays = REN.avisoDias;
  const intlPhone = (n) => { n = String(n || "").replace(/\D/g, ""); return n ? (n.length <= 11 ? "55" + n : n) : ""; };
  U.renewPhone = () => intlPhone(REN.whatsapp);
  U.renewPhoneLabel = () => String(REN.whatsapp).replace(/\D/g, "").replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");

  /** Situação do plano de uma loja: null (tudo certo), "vence" (≤ avisoDias) ou "venceu". */
  U.renewState = (p) => {
    if (!p || !p.expiresAt || p.role === "admin") return null;
    const d = U.daysLeft(p.expiresAt);
    if (d <= 0) return "venceu";
    return d <= REN.avisoDias ? "vence" : null;
  };
  const prazo = (p) => {
    const d = U.daysLeft(p.expiresAt);
    return d <= 0 ? `venceu em ${U.date(p.expiresAt)}` : d === 1 ? `vence amanhã (${U.date(p.expiresAt)})` : `vence em ${d} dias (${U.date(p.expiresAt)})`;
  };

  /** Link para a loja falar com o suporte e renovar (mensagem já preenchida). */
  U.renewLink = (p = {}) => {
    const txt = p.expiresAt
      ? `Olá! Quero renovar o plano do Catálogo Online.\nLoja: ${p.name || ""}\nE-mail: ${p.email || ""}\nO acesso ${prazo(p)}.`
      : `Olá! Quero renovar o plano do Catálogo Online.${p.email ? `\nE-mail: ${p.email}` : ""}`;
    return `https://wa.me/${U.renewPhone()}?text=${encodeURIComponent(txt)}`;
  };

  /** Lembrete que o administrador envia ao cliente, com o link direto para renovar. */
  U.reminderText = (p) => [
    `Olá, ${(p.name || "").split(" ")[0] || "tudo bem"}! 👋`,
    "",
    `Seu acesso ao *Catálogo Online* ${prazo(p)}.`,
    U.daysLeft(p.expiresAt) <= 0
      ? "Seu catálogo está fora do ar. Renove para voltar a vender hoje mesmo."
      : "Para não perder tempo e manter seu catálogo no ar, renove seu plano.",
    "",
    `👉 Fale com a gente: https://wa.me/${U.renewPhone()}`,
    `ou chame no WhatsApp ${U.renewPhoneLabel()}.`
  ].join("\n");
  U.reminderWhatsApp = (p, clientPhone) => `https://wa.me/${intlPhone(clientPhone)}?text=${encodeURIComponent(U.reminderText(p))}`;
  U.reminderEmail = (p) => `mailto:${encodeURIComponent(p.email || "")}?subject=${encodeURIComponent("Seu acesso ao Catálogo Online está vencendo")}&body=${encodeURIComponent(U.reminderText(p).replace(/\*/g, ""))}`;

  /** Mostra/oculta senha nos campos com data-toggle-pass. */
  U.passToggles = () => U.$$("input[type=password][data-toggle-pass]").forEach((inp) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "pass-eye"; b.textContent = "Mostrar"; b.setAttribute("aria-label", "Mostrar senha");
    b.onclick = () => {
      const show = inp.type === "password";
      inp.type = show ? "text" : "password";
      b.textContent = show ? "Ocultar" : "Mostrar"; b.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
    };
    inp.parentNode.classList.add("pass-wrap"); inp.after(b);
  });

  /* ---------- transição de entrada e saída (cortina) ---------- */
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TR_KEY = "cat_transition";
  function trStyles() {
    if (document.getElementById("tr-css")) return;
    const st = document.createElement("style");
    st.id = "tr-css";
    st.textContent = `
      .tr-curtain{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;
        background:var(--tr-color,#ff6a36);color:#111;font-family:Inter,Arial,Helvetica,sans-serif;text-align:center;padding:24px;
        clip-path:circle(0% at var(--tr-x,50%) var(--tr-y,50%));transition:clip-path .62s cubic-bezier(.7,0,.25,1)}
      .tr-curtain.on{clip-path:circle(150% at var(--tr-x,50%) var(--tr-y,50%))}
      .tr-curtain.leave{transition:clip-path .7s cubic-bezier(.7,0,.25,1) .08s;clip-path:circle(0% at 50% 120%)}
      .tr-curtain .tr-mark{width:68px;height:68px;border-radius:50%;background:#111;color:var(--tr-color,#ff6a36);display:flex;align-items:center;justify-content:center;
        transform:scale(.4);opacity:0;transition:transform .45s cubic-bezier(.3,1.6,.5,1) .3s,opacity .3s .3s}
      .tr-curtain .tr-mark svg{width:34px;height:34px}
      .tr-curtain .tr-mark path{stroke-dasharray:40;stroke-dashoffset:40;transition:stroke-dashoffset .45s ease .55s}
      .tr-curtain.on .tr-mark{transform:scale(1);opacity:1}
      .tr-curtain.on .tr-mark path{stroke-dashoffset:0}
      .tr-curtain h2{margin:0;font-size:clamp(28px,6vw,52px);letter-spacing:-.04em;font-weight:800;line-height:1.05;opacity:0;transform:translateY(16px);transition:all .45s ease .4s}
      .tr-curtain p{margin:0;font-size:15px;font-weight:600;opacity:0;transition:opacity .4s ease .55s}
      .tr-curtain.on h2{opacity:1;transform:none}.tr-curtain.on p{opacity:.75}
      .tr-curtain.leave h2,.tr-curtain.leave p,.tr-curtain.leave .tr-mark{opacity:0;transition:opacity .2s}
      @media (prefers-reduced-motion: reduce){
        .tr-curtain,.tr-curtain.on,.tr-curtain.leave{clip-path:none!important;transition:opacity .25s!important}
        .tr-curtain{opacity:0}.tr-curtain.on{opacity:1}.tr-curtain.leave{opacity:0}
        .tr-curtain *{transition:none!important;transform:none!important;opacity:1!important;stroke-dashoffset:0!important}
      }`;
    document.head.appendChild(st);
  }
  const ICONS = {
    in: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  function curtain({ title, sub, icon = "in", color, x, y }) {
    trStyles();
    const c = document.createElement("div");
    c.className = "tr-curtain"; c.setAttribute("role", "status"); c.setAttribute("aria-live", "assertive");
    if (color) c.style.setProperty("--tr-color", color);
    if (x != null) { c.style.setProperty("--tr-x", x + "px"); c.style.setProperty("--tr-y", y + "px"); }
    c.innerHTML = `<div class="tr-mark">${ICONS[icon] || ICONS.in}</div><h2>${U.esc(title)}</h2>${sub ? `<p>${U.esc(sub)}</p>` : ""}`;
    document.body.appendChild(c);
    return c;
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Cobre a tela com a cortina e depois navega. A próxima página abre a cortina (U.pageEnter).
   * o: { title, sub, icon: "in"|"out", color, from: elemento de onde a cortina nasce }
   */
  U.leaveTo = async (url, o = {}) => {
    let x, y;
    if (o.from && o.from.getBoundingClientRect) { const r = o.from.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
    const c = curtain({ ...o, x, y });
    c.getBoundingClientRect(); // garante a animação
    c.classList.add("on");
    try { sessionStorage.setItem(TR_KEY, JSON.stringify({ title: o.title, sub: o.sub || "", icon: o.icon || "in", color: o.color || "" })); } catch { /* ignore */ }
    await wait(REDUCED ? 250 : 1250);
    if (url === "reload") location.reload(); else location.replace(url);
  };

  /** Ao abrir a página: se veio de um login/saída, mostra a cortina coberta e a abre revelando a tela. */
  U.pageEnter = () => {
    let t = null;
    try { t = JSON.parse(sessionStorage.getItem(TR_KEY)); sessionStorage.removeItem(TR_KEY); } catch { t = null; }
    if (!t) { document.documentElement.classList.remove("tr-pending"); return; }
    const c = curtain(t);
    c.style.transition = "none"; c.classList.add("on");
    document.documentElement.classList.remove("tr-pending");
    c.getBoundingClientRect();
    c.style.transition = "";
    requestAnimationFrame(() => setTimeout(() => {
      c.classList.add("leave");
      setTimeout(() => c.parentNode && c.parentNode.removeChild(c), REDUCED ? 300 : 900);
    }, REDUCED ? 50 : 250));
  };
  U.pageEnter();

  /** Sair com animação: "Até logo!" e volta para o login. */
  U.logout = async (btn, back = "index.html?saiu=1") => {
    if (btn) btn.disabled = true;
    const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff6a36";
    const leaving = U.leaveTo(back, { title: "Até logo!", sub: "Você saiu com segurança.", icon: "out", color, from: btn });
    try { await DB.logout(); } catch { /* segue para o login mesmo assim */ }
    await leaving;
  };

  /** Gráfico de colunas simples (SVG) com dica ao passar o mouse. series: [{day:"AAAA-MM-DD", n}] */
  U.columnChart = (el, series, unit = ["item", "itens"]) => {
    const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
    const total = series.reduce((t, d) => t + (d.n || 0), 0);
    const max = Math.max(1, ...series.map((d) => d.n || 0));
    const W = Math.max(280, Math.round(el.clientWidth || 640)), H = W < 500 ? 160 : 190, padL = 34, padB = 22, padT = 10;
    const bw = (W - padL) / Math.max(1, series.length), barW = Math.min(28, Math.max(3, bw - 2));
    const p10 = Math.pow(10, Math.floor(Math.log10(max))), top = Math.max(2, Math.ceil(max / p10) * p10);
    const y = (n) => padT + (H - padT - padB) * (1 - n / top);
    const fmtDay = (k) => { const [, mm, dd] = k.split("-"); return `${dd}/${mm}`; };
    const every = Math.max(1, Math.ceil(series.length / Math.max(3, Math.floor((W - padL) / 64))));
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${series.length} dias, total ${fmtN(total)} ${unit[1]}.">
      ${[0, top / 2, top].map((t) => `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" class="tick" text-anchor="end">${fmtN(t)}</text>`).join("")}
      ${series.map((d, i) => {
        const n = d.n || 0, x = padL + i * bw + (bw - barW) / 2, h = (H - padT - padB) * (n / top), r = Math.min(4, h / 2, barW / 2);
        const path = h > 0 ? `M${x},${y(0)} V${y(n) + r} Q${x},${y(n)} ${x + r},${y(n)} H${x + barW - r} Q${x + barW},${y(n)} ${x + barW},${y(n) + r} V${y(0)} Z` : "";
        return `<g class="col" tabindex="0" data-tip="${fmtDay(d.day)}: ${fmtN(n)} ${n === 1 ? unit[0] : unit[1]}">
          <rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}" class="hit"/>${path ? `<path d="${path}" class="bar"/>` : ""}
          ${i % every === 0 ? `<text x="${x + barW / 2}" y="${H - 6}" class="tick" text-anchor="middle">${fmtDay(d.day)}</text>` : ""}</g>`;
      }).join("")}
    </svg><div class="tip" hidden></div>`;
    const tip = el.querySelector(".tip");
    const show = (g) => {
      if (!g) return;
      const box = el.getBoundingClientRect(), r = g.querySelector(".hit").getBoundingClientRect();
      tip.textContent = g.dataset.tip; tip.hidden = false;
      tip.style.left = `${Math.min(box.width - 140, Math.max(0, r.left - box.left + r.width / 2 - 70))}px`;
    };
    el.onpointerover = (e) => show(e.target.closest(".col"));
    el.onfocusin = (e) => show(e.target.closest(".col"));
    el.onpointerleave = () => { tip.hidden = true; };
  };

  /* ===== Selos de confiança (todos verdadeiros e verificáveis) ===== */
  const TRUST_ICONS = {
    lock: '<path d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1Zm2 0h6V7a3 3 0 0 0-6 0v3Z"/>',
    shield: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm-1.2 13.6-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4-6.3 6.3Z"/>',
    cloud: '<path d="M19 18H7a5 5 0 0 1-.6-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1 1 9Z"/>',
    pix: '<path d="m12 2 4.2 4.2-2.1 2.1L12 6.2 9.9 8.3 7.8 6.2 12 2Zm-5.8 5.8 2.1 2.1L6.2 12l2.1 2.1-2.1 2.1L2 12l4.2-4.2Zm11.6 0L22 12l-4.2 4.2-2.1-2.1 2.1-2.1-2.1-2.1 2.1-2.1ZM12 9.9 14.1 12 12 14.1 9.9 12 12 9.9Zm-2.1 5.8 2.1 2.1 2.1-2.1 2.1 2.1L12 22l-4.2-4.2 2.1-2.1Z"/>',
    search: '<path d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/>'
  };
  const TRUST = {
    https: { icon: "lock", t: "Conexão criptografada", s: "HTTPS · SSL" },
    login: { icon: "shield", t: "Login protegido", s: "Google Firebase" },
    cloud: { icon: "cloud", t: "Dados na nuvem", s: "Google Cloud" },
    pix: { icon: "pix", t: "Pagamento via Pix", s: "Sistema do Banco Central" },
    google: { icon: "search", t: "Verificar no Google", s: "Navegação segura ↗", link: true }
  };
  const TRUST_SETS = { login: ["https", "login", "cloud", "google"], pay: ["https", "pix", "cloud", "google"], shop: ["https", "cloud", "google"] };
  U.trustBadges = () => {
    const host = location.hostname;
    const real = host && host !== "localhost" && !/^[\d.]+$/.test(host);
    document.querySelectorAll("[data-trust]").forEach((box) => {
      const keys = TRUST_SETS[box.dataset.trust] || TRUST_SETS.shop;
      box.innerHTML = keys.filter((k) => k !== "google" || real).map((k) => {
        const b = TRUST[k];
        const inner = `<svg viewBox="0 0 24 24" aria-hidden="true">${TRUST_ICONS[b.icon]}</svg><span><b>${b.t}</b><small>${b.s}</small></span>`;
        return b.link
          ? `<a class="trust-item" href="https://transparencyreport.google.com/safe-browsing/search?url=${encodeURIComponent(host)}&hl=pt_BR" target="_blank" rel="noopener" title="Confira no relatório de Navegação Segura do Google">${inner}</a>`
          : `<span class="trust-item">${inner}</span>`;
      }).join("");
      box.setAttribute("aria-label", "Selos de segurança");
    });
  };
  U.trustBadges();

  window.U = U;
})();
