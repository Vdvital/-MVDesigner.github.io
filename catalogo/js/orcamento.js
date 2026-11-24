/* Gera o orçamento em PDF (A4) com cabeçalho da loja, fotos, tabela e total. */
(function () {
  const LIBS = [
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"
  ];
  let libsPromise;
  const loadScript = (src) => new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error("Não foi possível carregar o gerador de PDF. Verifique a internet."));
    document.head.appendChild(s);
  });
  const loadLibs = () => (libsPromise = libsPromise || (async () => {
    if (!window.jspdf) await loadScript(LIBS[0]);
    await loadScript(LIBS[1]);
    return window.jspdf.jsPDF;
  })().catch((e) => { libsPromise = null; throw e; }));

  /* ---------- cores ---------- */
  const hexToRgb = (hex) => {
    const m = String(hex || "").replace("#", "").match(/^([0-9a-f]{6})$/i);
    const n = parseInt(m ? m[1] : "ff6a36", 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const isLight = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) > 160;
  const mix = (c, w) => c.map((v) => Math.round(v + (255 - v) * w));

  /* ---------- imagens (fotos do Drive viram JPEG pequeno dentro do PDF) ---------- */
  function loadImage(url, timeout = 6000) {
    return new Promise((ok) => {
      if (!url) return ok(null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.referrerPolicy = "no-referrer";
      const t = setTimeout(() => ok(null), timeout);
      img.onload = () => {
        clearTimeout(t);
        try {
          const size = 220, c = document.createElement("canvas");
          c.width = size; c.height = size;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
          const s = Math.min(size / img.width, size / img.height);
          const w = img.width * s, h = img.height * s;
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
          ok(c.toDataURL("image/jpeg", 0.85));
        } catch { ok(null); } // imagem sem permissão (CORS): segue sem foto
      };
      img.onerror = () => { clearTimeout(t); ok(null); };
      img.src = url;
    });
  }
  const photoUrl = (p) => (p.images && p.images.length ? U.driveImg(p.images[0], 300) : p.imageUrl || "");

  const money = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " "));
  const phone = (n) => String(n || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");

  /**
   * @param {object} o { store, seller:{name, role, whatsapp}, client, obs, items:[{p, qty, unit}], number }
   * @returns {Promise<{blob: Blob, filename: string, total: number}>}
   */
  async function build(o) {
    const jsPDF = await loadLibs();
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
    const accent = hexToRgb(o.store.accent), onAccent = isLight(accent) ? [17, 17, 17] : [255, 255, 255];
    const ink = [20, 20, 20], muted = [110, 110, 115], line = [228, 226, 221];
    const now = new Date();
    const valid = new Date(now.getTime() + 7 * 86400000);
    const fmtDate = (d) => d.toLocaleDateString("pt-BR");

    const photos = await Promise.all(o.items.map((it) => loadImage(photoUrl(it.p))));

    /* cabeçalho */
    doc.setFillColor(...accent); doc.rect(0, 0, W, 34, "F");
    // logo da loja num quadrado branco à esquerda do nome
    let tx = M;
    if (o.store.logo && /^data:image\/png/.test(o.store.logo)) {
      try {
        doc.setFillColor(255, 255, 255); doc.roundedRect(M, 6, 22, 22, 3, 3, "F");
        doc.addImage(o.store.logo, "PNG", M + 1.5, 7.5, 19, 19);
        tx = M + 27;
      } catch { tx = M; }
    }
    doc.setTextColor(...onAccent);
    doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.text(doc.splitTextToSize(o.store.name || "Catálogo", W - tx - M - 62)[0], tx, 16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    const contacts = [o.store.whatsapp && `WhatsApp ${phone(o.store.whatsapp)}`, o.store.instagram && `@${o.store.instagram}`].filter(Boolean).join("   ·   ");
    if (contacts) doc.text(contacts, tx, 24);
    doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    const consulta = o.tipo === "consulta";
    doc.text(consulta ? "PEDIDO" : "ORÇAMENTO", W - M, 15, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    doc.text(`Nº ${o.number}`, W - M, 21.5, { align: "right" });
    doc.text(`Emitido em ${fmtDate(now)}`, W - M, 26.5, { align: "right" });

    /* blocos cliente / vendedor / validade */
    let y = 44;
    const colW = (W - 2 * M - 8) / 3;
    const BH = 26; // altura dos blocos (cabe nome + 2 linhas)
    const block = (x, label, lines) => {
      doc.setFillColor(...mix(accent, 0.9)); doc.roundedRect(x, y, colW, BH, 2, 2, "F");
      doc.setTextColor(...muted); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
      doc.text(label.toUpperCase(), x + 4, y + 6);
      doc.setTextColor(...ink); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
      doc.text(doc.splitTextToSize(lines[0] || "—", colW - 8)[0], x + 4, y + 12.5);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...muted);
      if (lines[1]) doc.text(doc.splitTextToSize(lines[1], colW - 8)[0], x + 4, y + 18);
      if (lines[2]) doc.text(doc.splitTextToSize(lines[2], colW - 8)[0], x + 4, y + 22.5);
    };
    const docNum = String(o.clientDoc || "").replace(/\D/g, "");
    block(M, "Cliente", [o.client,
      o.clientDoc ? `${docNum.length === 11 ? "CPF" : "CNPJ"} ${o.clientDoc}` : "",
      o.clientPhone ? `WhatsApp ${o.clientPhone}` : ""]);
    block(M + colW + 4, o.seller.role || "Vendedor", [o.seller.name, o.seller.whatsapp ? `WhatsApp ${phone(o.seller.whatsapp)}` : ""]);
    if (consulta) block(M + 2 * (colW + 4), "Situação", ["Preço a consultar", "O vendedor responde pelo WhatsApp"]);
    else block(M + 2 * (colW + 4), "Validade", [fmtDate(valid), "7 dias a partir da emissão"]);
    y += BH + 8;

    /* tabela */
    let total = 0, units = 0;
    const body = o.items.map((it, i) => {
      const sub = it.unit != null ? it.unit * it.qty : null;
      if (sub != null) total += sub;
      units += it.qty;
      const promo = it.p.promoPrice != null && it.p.price != null && it.p.promoPrice < it.p.price;
      return [
        "",
        String(it.p.code),
        { content: (it.p.name || "Produto") + (it.p.category ? `\n${it.p.category}` : "") + (it.p.boxQty ? `\nCaixa com ${it.p.boxQty} un.` : "") + (it.p.colors && it.p.colors.length ? `\nCores: ${it.p.colors.join(", ")}` : "") + (it.p.isNew ? "\nNovidade" : "") + (promo ? `\nPromoção: de ${money(it.p.price)}` : ""), _promo: promo, _cat: !!it.p.category },
        it.p.boxQty ? `${it.qty % it.p.boxQty ? Math.floor(it.qty / it.p.boxQty) + " cx + " + (it.qty % it.p.boxQty) + " un" : it.qty / it.p.boxQty + " cx"}\n${it.qty} un` : `${it.qty} cx`,
        it.unit != null ? money(it.unit) + (it.p.boxQty ? `\nCx ${money(it.unit * it.p.boxQty)}` : "") : "A consultar",
        sub != null ? money(sub) : "—"
      ];
    });
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M, bottom: 22 },
      head: [["Foto", "Código", "Produto", "Qtd.", "Valor unit.", "Subtotal"]],
      body,
      theme: "plain",
      styles: { font: "helvetica", fontSize: 9, textColor: ink, cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 }, valign: "middle", minCellHeight: 20, lineColor: line, lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: [24, 24, 24], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5, minCellHeight: 9 },
      alternateRowStyles: { fillColor: [250, 249, 247] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22, fontStyle: "bold" },
        2: { cellWidth: "auto" },
        3: { cellWidth: 14, halign: "center" },
        4: { cellWidth: 28, halign: "right" },
        5: { cellWidth: 30, halign: "right", fontStyle: "bold" }
      },
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 2 && d.cell.raw && d.cell.raw._promo) d.cell.styles.textColor = ink;
        if (d.section === "body" && d.column.index === 4 && body[d.row.index][2]._promo) d.cell.styles.textColor = [200, 30, 50];
      },
      didDrawCell: (d) => {
        if (d.section !== "body" || d.column.index !== 0) return;
        const img = photos[d.row.index], s = 16;
        const x = d.cell.x + (d.cell.width - s) / 2, yy = d.cell.y + (d.cell.height - s) / 2;
        if (img) {
          doc.addImage(img, "JPEG", x, yy, s, s);
          doc.setDrawColor(...line); doc.setLineWidth(0.2); doc.roundedRect(x, yy, s, s, 1, 1, "S");
        } else {
          doc.setFillColor(238, 237, 233); doc.roundedRect(x, yy, s, s, 1, 1, "F");
          doc.setTextColor(...muted); doc.setFontSize(6.5);
          doc.text(String(o.items[d.row.index].p.code).slice(0, 10), x + s / 2, yy + s / 2 + 1, { align: "center" });
        }
      }
    });

    /* totais */
    y = doc.lastAutoTable.finalY + 6;
    if (y > H - 60) { doc.addPage(); y = 20; }
    const boxW = 78, bx = W - M - boxW;
    doc.setFillColor(...mix(accent, 0.9)); doc.roundedRect(bx, y, boxW, 26, 2, 2, "F");
    doc.setTextColor(...muted); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`${o.items.length} ${o.items.length === 1 ? "produto" : "produtos"} · ${units} ${units === 1 ? "unidade" : "unidades"}`, bx + 5, y + 7);
    doc.setTextColor(...ink); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("TOTAL", bx + 5, y + 18);
    doc.setFontSize(consulta ? 12 : 17); doc.setTextColor(...(isLight(accent) ? ink : accent));
    doc.text(consulta ? "A consultar" : money(total), bx + boxW - 5, y + 19, { align: "right" });

    /* observações */
    let oy = y;
    const obsW = W - 2 * M - boxW - 8;
    if (o.obs) {
      doc.setTextColor(...muted); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
      doc.text("OBSERVAÇÕES", M, oy + 5);
      doc.setTextColor(...ink); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      doc.text(doc.splitTextToSize(o.obs, obsW), M, oy + 10.5);
    }
    if (!consulta && o.items.some((it) => it.unit == null)) {
      doc.setTextColor(...muted); doc.setFontSize(8);
      doc.text("Itens sem preço serão confirmados pelo vendedor.", M, y + 30);
    }

    /* rodapé em todas as páginas */
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(...line); doc.setLineWidth(0.3); doc.line(M, H - 16, W - M, H - 16);
      doc.setTextColor(...muted); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      doc.text("Preços e disponibilidade sujeitos a confirmação no fechamento do pedido.", M, H - 10.5);
      doc.text(`${o.store.name || ""} · ${consulta ? "Pedido" : "Orçamento"} ${o.number} · Página ${i} de ${pages}`, W - M, H - 10.5, { align: "right" });
    }

    const safe = (o.client || "cliente").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
    return { blob: doc.output("blob"), filename: `${consulta ? "Pedido" : "Orcamento"}-${o.number}-${safe}.pdf`, total };
  }

  const newNumber = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  };

  window.Orcamento = { build, newNumber };
})();
