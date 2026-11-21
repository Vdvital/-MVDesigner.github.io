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
    return {
      pix: Object.assign({ chave: "", nome: "", cidade: "" }, c.pix || {}),
      plano: Object.assign({ nome: "Mensal", valor: 1000, dias: 30 }, c.plano || {})
    };
  };
  const newTxid = (prefix = "MV") => (prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase().slice(0, 25);

  const money = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  /**
   * Monta o bloco de pagamento (QR Code + copia e cola + botão copiar) dentro de `el`.
   * o: { valor, txid, descricao }. Retorna o código copia e cola (ou "" se o Pix não estiver configurado).
   */
  async function mountPay(el, o) {
    const { pix } = cfg();
    if (!pix.chave) {
      el.innerHTML = `<div class="pix-missing">O pagamento por Pix ainda não foi configurado. Fale com a gente pelo WhatsApp para concluir.</div>`;
      return "";
    }
    const code = payload({ chave: pix.chave, nome: pix.nome, cidade: pix.cidade, valor: o.valor, txid: o.txid, descricao: o.descricao });
    el.innerHTML = `
      <div class="pix-box">
        <div class="pix-qr" aria-live="polite"><div class="pix-qr-loading">Gerando QR Code…</div></div>
        <div class="pix-info">
          <div class="pix-amount"><small>Valor</small><b>${money(o.valor)}</b></div>
          <ol class="pix-steps">
            <li>Abra o app do seu banco e escolha <b>Pix</b>.</li>
            <li>Escaneie o QR Code ou use o <b>Pix copia e cola</b>.</li>
            <li>Confira o recebedor <b>${(pix.nome || "").replace(/</g, "")}</b> e pague.</li>
          </ol>
          <label class="pix-label" for="pix-code-${o.txid}">Pix copia e cola</label>
          <div class="pix-copy"><input id="pix-code-${o.txid}" readonly value="${code}"><button type="button" class="btn sm primary">Copiar</button></div>
        </div>
      </div>`;
    const input = el.querySelector(".pix-copy input"), btn = el.querySelector(".pix-copy button");
    btn.onclick = async () => {
      try { await navigator.clipboard.writeText(code); } catch { input.select(); document.execCommand("copy"); }
      btn.textContent = "Copiado ✓"; setTimeout(() => { btn.textContent = "Copiar"; }, 2000);
    };
    renderQr(el.querySelector(".pix-qr"), code).catch((e) => { el.querySelector(".pix-qr").innerHTML = `<p class="hint">${e.message}</p>`; });
    return code;
  }

  window.Pix = { payload, crc16, renderQr, cfg, newTxid, mountPay, money };
})();
