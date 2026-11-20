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

  /* ---------- dinheiro e datas ---------- */
  U.parseMoney = (v) => {
    if (typeof v === "number") return isFinite(v) ? v : null;
    let s = String(v ?? "").replace(/[^\d,.-]/g, "").trim();
    if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  };
  U.money = (n) => (n == null || n === "" ? "" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  U.date = (ms) => (ms ? new Date(ms).toLocaleDateString("pt-BR") : "—");
  U.dateTime = (ms) => (ms ? new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "nunca");
  U.daysLeft = (ms) => (ms ? Math.ceil((ms - Date.now()) / 86400000) : null);
  U.inputDate = (ms) => { if (!ms) return ""; const d = new Date(ms); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  U.endOfDay = (yyyyMmDd) => { const [y, m, d] = yyyyMmDd.split("-").map(Number); return new Date(y, m - 1, d, 23, 59, 59).getTime(); };

  U.discount = (p) => (p.promoPrice && p.price && p.promoPrice < p.price ? Math.round((1 - p.promoPrice / p.price) * 100) : 0);

  /* ---------- autenticação nas páginas ---------- */
  /** Página inicial de cada tipo de conta. */
  U.homeFor = (me) => me.role === "admin" ? "admin.html"
    : DB.TEAM.includes(me.role) ? `loja.html?loja=${encodeURIComponent(me.slug)}` : "painel.html";

  U.requireLogin = async (role) => {
    const me = await DB.current();
    if (!me) { location.replace("index.html"); return null; }
    if (DB.TEAM.includes(me.role)) { location.replace(U.homeFor(me)); return null; }
    if (role === "admin" && me.role !== "admin") { location.replace("painel.html"); return null; }
    if (me.role !== "admin" && DB.accessStatus(me) !== "ativo") { await DB.logout(); location.replace("index.html?expirado=1"); return null; }
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
      images: []
    })).filter((p) => p.code);
  };

  U.exportProductsToExcel = async (products, filename) => {
    const XLSX = await U.loadXLSX();
    const data = products.map((p) => ({
      "Código": p.code, "Nome": p.name, "Descrição": p.description, "Categoria": p.category,
      "Preço": p.price ?? "", "Preço promocional": p.promoPrice ?? "",
      "Link da imagem": p.images && p.images.length ? U.driveImg(p.images[0], 1200) : (p.imageUrl || "")
    }));
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ "Código": "1020", "Nome": "Garrafa térmica 1L", "Descrição": "Aço inox, mantém a temperatura por 12h", "Categoria": "Utilidades", "Preço": 89.9, "Preço promocional": 69.9, "Link da imagem": "" }]);
    ws["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 44 }, { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 40 }];
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

  window.U = U;
})();
