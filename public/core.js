// Núcleo compartilhado das páginas: utilidades, acesso aos dados, cálculos de custo/preço e navegação.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const brl = (v) => (isFinite(v) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");
  const nf = (v, d = 2) => (isFinite(v) ? v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
  const P = (v) => { if (typeof v === "number") return v; let s = String(v ?? "").trim(); if (!s) return NaN; if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); const n = parseFloat(s); return isFinite(n) ? n : NaN; };
  const Z = (v) => { const n = P(v); return isFinite(n) ? n : 0; };
  const show = (v) => (v === null || v === undefined || v === "" || !isFinite(v) ? "" : String(+(+v).toFixed(4)).replace(".", ","));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const pick = (v, d) => { const n = P(v); return isFinite(n) ? n : Z(d); };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ---------- dados: API do Worker + D1 ---------- */
  async function req(method, path, body) {
    const r = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 404 && method === "GET") return null;
    if (!r.ok) { let info = {}; try { info = await r.json(); } catch {} const e = new Error(info.error || "HTTP " + r.status); e.status = r.status; e.info = info; throw e; }
    return r.json();
  }
  const db = {
    list: async (col) => ((await req("GET", `/api/${col}`)) || []).map((r) => ({ id: r.id, ...r.data })),
    get: async (col, id) => { const d = await req("GET", `/api/${col}/${id}`); return d ? { id: d.id, ...d.data } : null; },
    put: async (col, id, data) => { const { id: _drop, ...body } = data; return req("PUT", `/api/${col}/${id}`, body); },
    del: (col, id) => req("DELETE", `/api/${col}/${id}`),
    newId: () => uid() + uid(),
  };
  // Mesma interface usada pelo cotador original (onSnapshot / doc / collection).
  function makeDb() {
    const subs = []; const meta = { fromCache: false, hasPendingWrites: false };
    async function deliver(s) {
      try {
        if (s.id) { const d = await req("GET", `/api/${s.col}/${s.id}`); s.next({ id: s.id, exists: !!d, data: () => (d ? d.data : undefined), metadata: meta }); return; }
        let rows = (await req("GET", `/api/${s.col}`)) || [];
        if (s.order) { const [f, dir] = s.order; rows.sort((a, b) => { const x = a.data[f], y = b.data[f]; return (x < y ? -1 : x > y ? 1 : 0) * (dir === "desc" ? -1 : 1); }); }
        if (s.lim) rows = rows.slice(0, s.lim);
        const docs = rows.map((r) => ({ id: r.id, exists: true, data: () => r.data, metadata: meta }));
        s.next({ docs, size: docs.length, empty: !docs.length, metadata: meta, docChanges: () => [] });
      } catch (e) { if (s.err) s.err({ code: e.status === 403 ? "revoked" : "unavailable", message: String(e) }); }
    }
    const refresh = (col) => subs.filter((s) => s.col === col).forEach(deliver);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) subs.forEach(deliver); });
    const sub = (s) => { subs.push(s); deliver(s); return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; };
    const docRef = (col, id) => ({ id, path: col + "/" + id,
      get: async () => { const d = await req("GET", `/api/${col}/${id}`); return { id, exists: !!d, data: () => (d ? d.data : undefined), metadata: meta }; },
      set: async (b) => { await req("PUT", `/api/${col}/${id}`, b); refresh(col); },
      delete: async () => { await req("DELETE", `/api/${col}/${id}`); refresh(col); },
      onSnapshot: (next, err) => sub({ col, id, next, err }) });
    const query = (col, order, lim) => ({
      orderBy: (f, dir = "asc") => query(col, [f, dir], lim),
      limit: (n) => query(col, order, n),
      doc: (id) => docRef(col, id || uid() + uid()),
      add: async (b) => { const r = docRef(col, uid() + uid()); await r.set(b); return r; },
      onSnapshot: (next, err) => sub({ col, id: null, next, err, order, lim }) });
    return { doc: (p) => { const [c, i] = p.split("/"); return docRef(c, i); }, collection: (c) => query(c, null, null) };
  }

  /* ---------- custos (mesma fórmula do cotador) ---------- */
  const DEF = { tarifa: 1.1, maoObra: 30, falha: 15, sobra: 5, precoPadrao: 120, setupMin: 10, acabMin: 0, atendMin: 10, margens: [40, 60, 80, 100], impressoras: [], horasDia: 16 };
  const withDef = (d) => ({ ...clone(DEF), ...(d ? clone(d) : {}) });
  function rate(imp, cfg) {
    const energia = (Z(imp.potencia) / 1000) * cfg.tarifa;
    const vida = Z(imp.vida);
    const dep = vida > 0 ? (Z(imp.valor) + Z(imp.acessorios)) / vida : 0;
    const man = Z(imp.manut);
    return { energia, dep, man, total: energia + dep + man };
  }
  const filKg = (f) => (f && Z(f.pesoRolo) > 0 ? Z(f.precoRolo) / (Z(f.pesoRolo) / 1000) : NaN);
  const filNome = (f) => (f ? [f.marca, f.material, f.cor].filter(Boolean).join(" · ") || "Sem nome" : "Preço padrão");

  // Custo de UMA peça a partir dos dados de produção do produto (uma mesa típica: g, h, q peças).
  function prodCost(p, cfg, fils) {
    const q = Math.max(1, Z(p.q) || 1), mesas = Math.max(1, Z(p.mesas) || 1);
    const fil = fils.find((f) => f.id === p.filId);
    const kg = isFinite(filKg(fil)) ? filKg(fil) : cfg.precoPadrao;
    const imp = cfg.impressoras.find((i) => i.id === p.impId) || cfg.impressoras[0] || null;
    const r = imp ? rate(imp, cfg) : { total: 0 };
    const g = Z(p.g) / q, h = Z(p.h) / q;
    const material = (g / 1000) * kg * (1 + cfg.sobra / 100);
    const maquina = h * r.total;
    const falha = ((material + maquina) * cfg.falha) / 100;
    const setup = pick(p.setupMin, cfg.setupMin), acab = pick(p.acabMin, cfg.acabMin);
    const mo = (((setup * mesas) / q + acab) / 60) * cfg.maoObra;
    const ins = Z(p.insUn) + Z(p.licUn);
    const producao = material + maquina + falha + mo + ins;
    const avulso = producao + Z(p.embUn) + (Z(p.embMin) / 60) * cfg.maoObra;
    return { g, h, material, maquina, falha, mo, ins, producao, avulso, fil, imp, q };
  }

  // Arredondamento de preço de venda.
  const ARRED = [
    { id: "", nome: "Sem arredondar" },
    { id: "90", nome: "Final ,90 (R$ 24,90)" },
    { id: "1", nome: "Real inteiro (R$ 25)" },
    { id: "5", nome: "Múltiplo de 5 (R$ 25, 30…)" },
  ];
  function roundPrice(v, mode) {
    if (!(v > 0)) return 0;
    if (mode === "90") return Math.max(0.9, Math.ceil(v + 0.1) - 0.1);
    if (mode === "1") return Math.ceil(v);
    if (mode === "5") return Math.ceil(v / 5) * 5;
    return Math.round(v * 100) / 100;
  }
  const margemDe = (x, cfg) => (P(x.margem) >= 0 ? P(x.margem) : Z(cfg.margens[1] ?? cfg.margens[0]));

  function prodPrices(p, cfg, fils) {
    const c = prodCost(p, cfg, fils), m = margemDe(p, cfg);
    const preco = P(p.precoManual) > 0 ? P(p.precoManual) : roundPrice(c.avulso * (1 + m / 100), p.arred);
    const precoKit = P(p.precoKitManual) > 0 ? P(p.precoKitManual) : roundPrice(c.producao * (1 + m / 100), p.arred);
    return { ...c, m, preco, precoKit, lucro: preco - c.avulso, lucroKit: precoKit - c.producao };
  }

  // Kit = vários produtos + embalagem/insumos + tempo de montar.
  function kitCalc(k, prodById, cfg, fils) {
    const linhas = (k.itens || []).map((it) => {
      const p = prodById.get(it.produtoId);
      if (!p) return { ...it, falta: true, qtd: Z(it.qtd), custo: 0, avulso: 0, g: 0, h: 0 };
      const pp = prodPrices(p, cfg, fils), qtd = Z(it.qtd);
      return { ...it, p, qtd, nome: p.nome, unit: pp.producao, custo: qtd * pp.producao, avulso: qtd * pp.preco, g: qtd * pp.g, h: qtd * pp.h, fil: pp.fil };
    });
    const pecas = linhas.reduce((a, l) => a + l.qtd, 0);
    const itens = linhas.reduce((a, l) => a + l.custo, 0);
    const mo = (Z(k.minMontagem) / 60) * cfg.maoObra;
    const custo = itens + Z(k.emb) + Z(k.ins) + mo;
    const m = margemDe(k, cfg);
    const sugerido = roundPrice(custo * (1 + m / 100), k.arred);
    const preco = P(k.precoManual) > 0 ? P(k.precoManual) : sugerido;
    const avulsoSoma = linhas.reduce((a, l) => a + l.avulso, 0);
    return { linhas, pecas, itens, mo, custo, m, sugerido, preco, lucro: preco - custo,
      markupReal: custo > 0 ? (preco / custo - 1) * 100 : 0,
      avulsoSoma, economia: avulsoSoma - preco,
      gramas: linhas.reduce((a, l) => a + l.g, 0), horas: linhas.reduce((a, l) => a + l.h, 0) };
  }

  /* ---------- pedidos ---------- */
  const ETAPAS = [
    { id: "novo", nome: "Novo · aguardando pagamento" },
    { id: "fila", nome: "Confirmado · na fila" },
    { id: "imprimindo", nome: "Imprimindo" },
    { id: "acabamento", nome: "Acabamento e montagem" },
    { id: "pronto", nome: "Pronto para entregar" },
    { id: "entregue", nome: "Entregue" },
  ];
  const etapaNome = (id) => (id === "cancelado" ? "Cancelado" : (ETAPAS.find((e) => e.id === id) || ETAPAS[0]).nome);
  const CANAIS = ["WhatsApp", "Instagram", "Presencial", "Indicação", "Outro"];
  const FORMAS = ["Pix", "Dinheiro", "Cartão", "Transferência", "Outro"];
  const pago = (o) => (o.pagamentos || []).reduce((a, p) => a + Z(p.valor), 0);
  function pagStatus(o) {
    const v = pago(o), t = Z(o.total);
    if (t > 0 && v >= t - 0.009) return { id: "pago", nome: "Pago", cls: "ok" };
    if (v > 0) return { id: "sinal", nome: `Sinal ${brl(v)}`, cls: "acc" };
    return { id: "pendente", nome: "Pagamento pendente", cls: "warn" };
  }
  // Peças a produzir em um pedido: kits viram os produtos que os compõem.
  function explode(o) {
    const m = new Map();
    (o.itens || []).forEach((it, i) => {
      if (it.componentes && it.componentes.length) {
        it.componentes.forEach((c) => {
          const k = c.produtoId; const cur = m.get(k) || { key: k, produtoId: k, nome: c.nome, qtd: 0 };
          cur.qtd += Z(it.qtd) * Z(c.qtd); m.set(k, cur);
        });
      } else {
        const k = "item" + i; m.set(k, { key: k, produtoId: null, nome: it.nome, qtd: Z(it.qtd) * Math.max(1, Z(it.pecas) || 1) });
      }
    });
    return [...m.values()];
  }
  // Mesma regra do servidor para montar preços de um carrinho a partir do catálogo publicado.
  function priceItems(itens, catById, extras) {
    return (itens || []).map((it) => {
      if (it.tipo === "produto" || it.tipo === "kit") {
        const c = catById.get(it.refId); if (!c) return null;
        return { tipo: it.tipo, refId: it.refId, nome: c.nome, qtd: Z(it.qtd) || 1, precoUnit: Z(c.preco),
          componentes: it.tipo === "produto" ? [{ produtoId: it.refId, nome: c.nome, qtd: 1 }] : (c.itens || []).map((x) => ({ produtoId: x.produtoId, nome: x.nome, qtd: Z(x.qtd) })) };
      }
      if (it.tipo === "montado") {
        const comps = (it.componentes || []).map((x) => { const c = catById.get(x.produtoId); return c ? { produtoId: x.produtoId, nome: c.nome, qtd: Z(x.qtd) || 1, unit: Z(c.precoKit ?? c.preco) } : null; }).filter(Boolean);
        if (!comps.length) return null;
        const ex = (extras || []).find((e) => e.id === it.extraId);
        const preco = comps.reduce((a, c) => a + c.qtd * c.unit, 0) + (ex ? Z(ex.preco) : 0);
        return { tipo: "montado", nome: it.nome || "Kit montado", qtd: Z(it.qtd) || 1, precoUnit: Math.round(preco * 100) / 100,
          componentes: comps.map(({ unit, ...c }) => c), extraId: ex ? ex.id : null, extraNome: ex ? ex.nome : null };
      }
      if (it.tipo === "avulso") return { ...it, qtd: Z(it.qtd) || 1, precoUnit: Z(it.precoUnit) };
      return null;
    }).filter(Boolean);
  }
  function totals(o) {
    const subtotal = (o.itens || []).reduce((a, i) => a + Z(i.qtd) * Z(i.precoUnit), 0);
    const total = subtotal * (1 - Z(o.descontoPct) / 100) + Z(o.frete);
    return { subtotal: Math.round(subtotal * 100) / 100, total: Math.round(total * 100) / 100 };
  }
  const itemResumo = (o) => (o.itens || []).map((i) => `${nf(Z(i.qtd), 0)}× ${i.nome}`).join(", ");
  const numero = (o) => (o.numero ? "#" + String(o.numero).padStart(4, "0") : "#----");

  /* ---------- fotos (reduzidas no navegador para caber no banco) ---------- */
  async function fileToJpeg(file, max = 900) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    let w = img.naturalWidth, h = img.naturalHeight; const s = Math.min(1, max / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(img.src);
    for (const q of [0.82, 0.7, 0.58, 0.45]) { const d = cv.toDataURL("image/jpeg", q); if (d.length < 240000) return d; }
    throw new Error("foto_grande");
  }
  const fotoUrl = (id) => (id ? `/foto/${encodeURIComponent(id)}` : "");

  /* ---------- interface ---------- */
  let tt = null;
  function toast(t) { let el = $(".toast"); if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); } el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; }, 2600); }
  const setStatus = (t) => { const s = $("#status"); if (s) s.textContent = t; };
  function banner(t) { const b = $("#banner"); if (!b) return; b.textContent = t; b.hidden = !t; }
  let armed = null;
  function arm(btn, key, fn) { if (armed === key) { armed = null; fn(); return; } armed = key; const old = btn.textContent; btn.textContent = "Confirmar?"; btn.classList.add("danger"); setTimeout(() => { if (armed === key) { armed = null; btn.textContent = old; btn.classList.remove("danger"); } }, 3000); }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast("Texto copiado"); }
    catch { window.prompt("Copie o texto:", t); }
  }

  const PAGES = [
    { href: "/", id: "cotador", nome: "Cotador" },
    { href: "/catalogo.html", id: "catalogo", nome: "Catálogo" },
    { href: "/pedidos.html", id: "pedidos", nome: "Pedidos" },
    { href: "/vendedores.html", id: "vendedores", nome: "Vendedores" },
    { href: "/vendedor.html", id: "vendedor", nome: "Área do vendedor" },
  ];
  let mePromise = null;
  const me = () => (mePromise ||= req("GET", "/api/me").catch(() => ({ role: "admin", modo: "aberto" })));
  // Monta o menu e manda o vendedor para a área dele se abrir uma página de administração.
  async function nav(active, { adminOnly = true } = {}) {
    const el = $("#topnav");
    const who = await me();
    if (adminOnly && who.role === "vendedor") { location.replace("/vendedor.html"); return who; }
    if (who.role === null || who.role === undefined) {
      document.querySelector("main").innerHTML = `<div class="panel"><h2>Sem acesso</h2><p class="hint">O e-mail ${esc(who.email || "")} não está cadastrado como administrador nem como vendedor. Peça para o responsável cadastrar você.</p></div>`;
      return who;
    }
    if (el) el.innerHTML = PAGES.filter((p) => who.role === "admin" || p.id === "vendedor")
      .map((p) => `<a href="${p.href}"${p.id === active ? ' aria-current="page"' : ""}>${p.nome}</a>`).join("");
    return who;
  }

  window.C3 = { $, $$, brl, nf, P, Z, show, esc, uid, pick, clone, req, db, makeDb, DEF, withDef, rate, filKg, filNome,
    prodCost, prodPrices, kitCalc, ARRED, roundPrice, margemDe, ETAPAS, etapaNome, CANAIS, FORMAS, pago, pagStatus, explode,
    priceItems, totals, itemResumo, numero, fileToJpeg, fotoUrl, toast, setStatus, banner, arm, copyText, nav, me };
})();
