/* Pix "copia e cola" (BR Code, padrão EMV do Banco Central) e QR Code — sem servidor. */
(function () {
  const clean = (s, max) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,\-\/@]/g, "").trim().slice(0, max);
  const tlv = (id, value) => id + String(value.length).padStart(2, "0") + value;

  /** CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), exigido no campo 63. */
  function crc16(str) {
    let crc = 0xffff;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }

  /**
   * Monta o código Pix copia e cola.
   * o: { chave, nome, cidade, valor (número), txid (até 25 letras/números), descricao }
   */
  function payload(o) {
    const chave = String(o.chave || "").trim();
    if (!chave) throw new Error("Chave Pix não configurada.");
    const conta = tlv("00", "br.gov.bcb.pix") + tlv("01", chave) + (o.descricao ? tlv("02", clean(o.descricao, 40)) : "");
    const txid = (String(o.txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25)) || "***";
    let p = tlv("00", "01")
      + tlv("26", conta)
      + tlv("52", "0000")
      + tlv("53", "986")
      + (o.valor ? tlv("54", Number(o.valor).toFixed(2)) : "")
      + tlv("58", "BR")
      + tlv("59", clean(o.nome, 25).toUpperCase() || "RECEBEDOR")
      + tlv("60", clean(o.cidade, 15).toUpperCase() || "BRASIL")
      + tlv("62", tlv("05", txid))
      + "6304";
    return p + crc16(p);
  }

  /* QR Code (biblioteca qrcode-generator, carregada só quando precisa) */
  let qrLib;
  const loadQr = () => (qrLib = qrLib || new Promise((ok, fail) => {
    if (window.qrcode) return ok(window.qrcode);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
    s.onload = () => ok(window.qrcode);
    s.onerror = () => { qrLib = null; fail(new Error("Não foi possível gerar o QR Code. Use o Pix copia e cola.")); };
    document.head.appendChild(s);
  }));

  /** Desenha o QR Code (SVG) dentro do elemento. */
  async function renderQr(el, text) {
    const qrcode = await loadQr();
    const qr = qrcode(0, "M");
    qr.addData(text); qr.make();
    el.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    const svg = el.querySelector("svg");
    if (svg) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "QR Code do Pix"); }
  }

  /** Configuração do Pix e do plano (config.js). */
  const cfg = () => {
    const c = window.CATALOGO_CONFIG || {};
    const planos = (Array.isArray(c.planos) && c.planos.length ? c.planos : [Object.assign({ id: "mensal", nome: "Mensal", valor: 996, dias: 30 }, c.plano || {})])
      .map((p, i) => ({ id: p.id || "p" + i, ...p }));
    return { pix: Object.assign({ chave: "", nome: "", cidade: "" }, c.pix || {}), planos, plano: planos[0] };
  };
  const newTxid = (prefix = "MV") => (prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase().slice(0, 25);

  const money = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  /** Chave Pix mascarada para o cliente conferir o recebedor (CPF ***.541.138-**, celular (**) *****-1234…). */
  function maskKey(k) {
    const d = String(k).replace(/\D/g, "");
    if (/@/.test(k)) { const [u, dom] = k.split("@"); return `${u.slice(0, 2)}***@${dom}`; }
    if (/^\+/.test(k)) return `(**) *****-${d.slice(-4)}`;
    if (d.length === 11) return `CPF ***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
    if (d.length === 14) return `CNPJ **.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
    return `${String(k).slice(0, 4)}…${String(k).slice(-4)}`;
  }
  const isPhone = () => matchMedia("(max-width: 760px), (pointer: coarse)").matches;

  /**
   * Monta o bloco de pagamento dentro de `el`.
   * Celular: botão grande "Copiar código Pix" + passo a passo do copia e cola; QR Code opcional (outro aparelho).
   * Computador: QR Code em destaque + passo a passo da câmera; copia e cola como alternativa.
   * o: { valor, txid, descricao }. Retorna o código copia e cola (ou "" se o Pix não estiver configurado).
   */
  async function mountPay(el, o) {
    const { pix } = cfg();
    if (!pix.chave) {
      el.innerHTML = `<div class="pix-missing">O pagamento por Pix ainda não foi configurado. Fale com a gente pelo WhatsApp para concluir.</div>`;
      return "";
    }
    const code = payload({ chave: pix.chave, nome: pix.nome, cidade: pix.cidade, valor: o.valor, txid: o.txid, descricao: o.descricao });
    const phone = isPhone();
    const recebedor = `<div class="pix-who" title="Confira estes dados no app do banco antes de confirmar">
        <span class="pix-lock" aria-hidden="true">🔒</span>
        <span><small>Recebedor</small><b>${clean(pix.nome, 40) || "—"}</b><em>${maskKey(pix.chave)}</em></span>
        <span class="pix-val"><small>Valor</small><b>${money(o.valor)}</b></span>
      </div>`;
    const copyBlock = `
      <button type="button" class="btn primary pix-copy-big" data-copy>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M8 8h11v13H8zM5 16H4V3h11v1"/></svg>
        <span>Copiar código Pix</span>
      </button>
      <div class="pix-code"><span>Pix copia e cola</span><code>${code}</code></div>`;
    const qrBlock = `<div class="pix-qr" aria-live="polite"><div class="pix-qr-loading">Gerando QR Code…</div></div>`;
    el.innerHTML = phone ? `
      <div class="pix-pay is-phone">
        ${recebedor}
        ${copyBlock}
        <ol class="pix-how">
          <li><b>Toque em “Copiar código Pix”</b> acima.</li>
          <li>Abra o <b>app do seu banco</b> e entre em <b>Pix → Pix copia e cola</b>.</li>
          <li><b>Cole o código</b>, confira o recebedor e o valor, e confirme.</li>
          <li>Volte para esta página e toque em <b>Já paguei</b>.</li>
        </ol>
        <details class="pix-other"><summary>Vai pagar com outro celular? Mostrar QR Code</summary>${qrBlock}</details>
      </div>` : `
      <div class="pix-pay is-desk">
        ${recebedor}
        <div class="pix-desk-grid">
          ${qrBlock}
          <div>
            <ol class="pix-how">
              <li>Abra o <b>app do seu banco</b> no celular.</li>
              <li>Escolha <b>Pix → Pagar com QR Code</b>.</li>
              <li><b>Aponte a câmera</b> para o código ao lado.</li>
              <li>Confira o recebedor e o valor, e <b>confirme</b>.</li>
            </ol>
            <p class="pix-or">Prefere copiar e colar?</p>
            ${copyBlock}
          </div>
        </div>
      </div>`;
    const btn = el.querySelector("[data-copy]");
    btn.onclick = async () => {
      let ok = true;
      try { await navigator.clipboard.writeText(code); }
      catch {
        ok = false;
        const r = document.createRange(); r.selectNodeContents(el.querySelector(".pix-code code"));
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        try { ok = document.execCommand("copy"); } catch { ok = false; }
      }
      btn.classList.add("done");
      btn.querySelector("span").textContent = ok ? "Código copiado! Agora cole no app do banco" : "Selecionei o código: copie e cole no banco";
      if (window.U && ok) U.toast("Código Pix copiado. Abra o app do banco → Pix → Pix copia e cola.");
      setTimeout(() => { btn.classList.remove("done"); btn.querySelector("span").textContent = "Copiar código Pix"; }, 4000);
    };
    const qrEl = el.querySelector(".pix-qr");
    const draw = () => renderQr(qrEl, code).catch((e) => { qrEl.innerHTML = `<p class="hint">${e.message}</p>`; });
    if (phone) el.querySelector(".pix-other").addEventListener("toggle", function once() { draw(); this.removeEventListener("toggle", once); });
    else draw();
    return code;
  }

  /**
   * Cartões para escolher o plano. onChange(plano) é chamado na escolha (e logo no início).
   * Retorna uma função que devolve o plano escolhido.
   */
  function planPicker(el, onChange, selectedId) {
    const { planos } = cfg();
    let cur = planos.find((p) => p.id === selectedId) || planos[0];
    const perMonth = (p) => (p.dias >= 300 ? ` · equivale a ${money(p.valor / Math.round(p.dias / 30.4))}/mês` : "");
    el.innerHTML = `<div class="plan-pick" role="radiogroup" aria-label="Escolha o plano">${planos.map((p) => `
      <button type="button" role="radio" aria-checked="${p.id === cur.id}" data-plan="${p.id}">
        <span class="pp-name">${p.nome}${p.selo ? `<em>${p.selo}</em>` : ""}</span>
        ${p.de ? `<s>${money(p.de)}</s>` : ""}
        <b>${money(p.valor)}</b>
        <small>${p.dias >= 300 ? "por ano" : `a cada ${p.dias} dias`}${perMonth(p)}</small>
      </button>`).join("")}</div>`;
    el.onclick = (e) => { // onclick (e não addEventListener): reabrir o seletor não duplica o clique
      const b = e.target.closest("[data-plan]"); if (!b) return;
      cur = planos.find((p) => p.id === b.dataset.plan);
      el.querySelectorAll("[data-plan]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      onChange && onChange(cur);
    };
    onChange && onChange(cur);
    return () => cur;
  }

  window.Pix = { payload, crc16, renderQr, cfg, newTxid, mountPay, money, planPicker, maskKey };
})();
