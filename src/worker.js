// Cotador 3D — Worker: serve as páginas (pasta public/) e a API de dados no D1.
//
// Rotas
//   GET  /api/me                      quem está acessando e com qual papel
//   GET  /api/:col  ·  GET|PUT|DELETE /api/:col/:id     (dados; o que cada papel pode ver está abaixo)
//   GET  /foto/:id                    foto de produto/kit (imagem)
//
// Papéis
//   admin     vê e altera tudo.
//   vendedor  e-mail cadastrado na aba Vendedores. Vê só o catálogo publicado (preços de venda, sem custo),
//             as opções da loja e os próprios pedidos. Os preços dos pedidos que ele cria são recalculados
//             aqui no servidor a partir do catálogo, com o desconto limitado ao máximo dele.
//
// Identificação: e-mail do Cloudflare Access. Depois que um administrador é cadastrado (aba Vendedores →
// Acesso), o token do Access passa a ser conferido pela assinatura, e quem não é admin nem vendedor fica fora.
// Sem administradores cadastrados (modo aberto), quem não é vendedor entra como admin, como na versão anterior.

const COLS = new Set([
  "config", "filamentos", "orcamentos", // cotador
  "produtos", "kits", "catalogo", "fotos", "loja", // catálogo
  "pedidos", "vendedores", "acesso", // vendas e produção
]);
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BYTES = 256 * 1024;
const TEAM_RE = /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/* ---------- banco ---------- */
async function getDoc(env, col, id) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE col = ? AND id = ?").bind(col, id).first();
  return r ? JSON.parse(r.data) : null;
}
async function listDocs(env, col) {
  const { results } = await env.DB.prepare("SELECT id, data FROM docs WHERE col = ? ORDER BY updated_at").bind(col).all();
  return results.map((r) => ({ id: r.id, data: JSON.parse(r.data) }));
}
async function putDoc(env, col, id, data) {
  await env.DB.prepare(
    `INSERT INTO docs (col, id, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).bind(col, id, JSON.stringify(data), new Date().toISOString()).run();
}
async function nextNumero(env) {
  const r = await env.DB.prepare(
    "SELECT MAX(CAST(json_extract(data, '$.numero') AS INTEGER)) AS n FROM docs WHERE col = 'pedidos'"
  ).first();
  return (r && r.n ? r.n : 0) + 1;
}

/* ---------- identificação (Cloudflare Access) ---------- */
const b64url = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
const decodePart = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));
const certCache = new Map();

async function accessKeys(team, force) {
  const c = certCache.get(team);
  if (c && !force && Date.now() - c.t < 3600e3) return c.keys;
  const r = await fetch(team + "/cdn-cgi/access/certs");
  if (!r.ok) return c ? c.keys : [];
  const keys = (await r.json()).keys || [];
  certCache.set(team, { t: Date.now(), keys });
  return keys;
}

async function verifyJwt(token, team) {
  try {
    const [h, p, s] = String(token || "").split(".");
    if (!s) return null;
    const header = decodePart(h), claims = decodePart(p);
    if (header.alg !== "RS256" || claims.iss !== team) return null;
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    let jwk = (await accessKeys(team)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await accessKeys(team, true)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(h + "." + p));
    return ok ? claims : null;
  } catch {
    return null;
  }
}

async function identify(request, env) {
  const acesso = (await getDoc(env, "acesso", "geral")) || {};
  const admins = (acesso.admins || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
  const jwt = request.headers.get("cf-access-jwt-assertion");
  let email = (request.headers.get("cf-access-authenticated-user-email") || "").trim().toLowerCase() || null;
  let verificado = false;
  if (acesso.team) {
    const claims = await verifyJwt(jwt, acesso.team);
    email = claims && claims.email ? String(claims.email).toLowerCase() : null;
    verificado = !!email;
  }
  const modo = admins.length ? "restrito" : "aberto";
  const base = { email, modo, verificado, jwt };
  if (email) {
    const r = await env.DB.prepare(
      "SELECT id, data FROM docs WHERE col = 'vendedores' AND lower(json_extract(data, '$.email')) = ?"
    ).bind(email).first();
    if (r) {
      const v = JSON.parse(r.data);
      if (v.ativo !== false) return { ...base, role: "vendedor", vend: { id: r.id, ...v } };
    }
  }
  if (admins.length) return { ...base, role: admins.includes(email) ? "admin" : null };
  return { ...base, role: "admin" };
}

/* ---------- preços dos pedidos do vendedor (recalculados no servidor) ---------- */
const num = (v, min = 0, max = 1e9) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const txt = (v, max = 500) => String(v ?? "").slice(0, max);
const r2 = (v) => Math.round(v * 100) / 100;

function priceItems(itens, cat, extras) {
  const out = [];
  for (const it of (Array.isArray(itens) ? itens : []).slice(0, 60)) {
    const qtd = Math.round(num(it.qtd, 1, 9999));
    if (it.tipo === "produto" || it.tipo === "kit") {
      const c = cat.get(it.refId);
      if (!c || c.tipo !== it.tipo) continue;
      out.push({
        tipo: it.tipo, refId: it.refId, nome: c.nome, qtd, precoUnit: r2(num(c.preco)),
        componentes: it.tipo === "produto"
          ? [{ produtoId: it.refId, nome: c.nome, qtd: 1 }]
          : (c.itens || []).map((x) => ({ produtoId: x.produtoId, nome: x.nome, qtd: num(x.qtd, 1) })),
      });
    } else if (it.tipo === "montado") {
      const comps = [];
      let preco = 0;
      for (const x of (Array.isArray(it.componentes) ? it.componentes : []).slice(0, 30)) {
        const c = cat.get(x.produtoId);
        if (!c || c.tipo !== "produto") continue;
        const q = Math.round(num(x.qtd, 1, 999));
        comps.push({ produtoId: x.produtoId, nome: c.nome, qtd: q });
        preco += q * num(c.precoKit ?? c.preco);
      }
      if (!comps.length) continue;
      const ex = extras.find((e) => e.id === it.extraId);
      if (ex) preco += num(ex.preco);
      out.push({ tipo: "montado", nome: txt(it.nome, 80) || "Kit montado", qtd, precoUnit: r2(preco), componentes: comps,
        extraId: ex ? ex.id : null, extraNome: ex ? ex.nome : null });
    }
  }
  return out;
}

async function sellerPutPedido(env, who, id, body, existing) {
  if (existing && existing.vendedor !== who.email) return json({ error: "forbidden" }, 403);
  if (existing && existing.status && existing.status !== "novo") return json({ error: "pedido_em_producao" }, 409);
  const cat = new Map((await listDocs(env, "catalogo")).map((r) => [r.id, r.data]));
  const loja = (await getDoc(env, "loja", "geral")) || {};
  const itens = priceItems(body.itens, cat, Array.isArray(loja.kitExtras) ? loja.kitExtras : []);
  if (!itens.length) return json({ error: "sem_itens" }, 400);
  const subtotal = r2(itens.reduce((a, i) => a + i.qtd * i.precoUnit, 0));
  const descontoPct = num(body.descontoPct, 0, num(who.vend.descMax, 0, 100));
  const frete = r2(num(body.frete, 0, 1e6));
  const now = new Date().toISOString();
  const doc = {
    ...(existing || {}),
    numero: existing?.numero || (await nextNumero(env)),
    status: "novo",
    criadoEm: existing?.criadoEm || now,
    vendedor: who.email,
    vendedorNome: who.vend.nome || who.email,
    comissaoPct: num(who.vend.comissao, 0, 100),
    cliente: txt(body.cliente, 120), contato: txt(body.contato, 120), canal: txt(body.canal, 40),
    prazo: txt(body.prazo, 10), obs: txt(body.obs, 2000),
    itens, subtotal, descontoPct, frete,
    total: r2(subtotal * (1 - descontoPct / 100) + frete),
    pagamentos: existing?.pagamentos || [],
    feito: existing?.feito || {},
    historico: existing?.historico || [{ em: now, status: "novo", por: who.email }],
  };
  await putDoc(env, "pedidos", id, doc);
  return json({ ok: true, id, numero: doc.numero });
}

/* ---------- API ---------- */
async function api(request, env, url) {
  const who = await identify(request, env);
  const parts = url.pathname.slice("/api/".length).split("/").filter(Boolean);
  const m = request.method;

  if (parts[0] === "me" && parts.length === 1 && m === "GET") {
    return json({
      email: who.email, role: who.role, modo: who.modo, verificado: who.verificado,
      vendedor: who.vend ? { nome: who.vend.nome, comissao: who.vend.comissao, descMax: who.vend.descMax } : null,
    });
  }
  if (!who.role) return json({ error: "sem_acesso", email: who.email }, 403);

  const [col, id] = parts;
  if (!COLS.has(col) || parts.length > 2 || (id && !ID_RE.test(id))) return json({ error: "not_found" }, 404);

  let body = null;
  if (m === "PUT") {
    if (!id) return json({ error: "method_not_allowed" }, 405);
    const text = await request.text();
    if (text.length > MAX_BYTES) return json({ error: "too_large" }, 413);
    try { body = JSON.parse(text); } catch { return json({ error: "invalid_json" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_body" }, 400);
  }

  /* vendedor: só catálogo, loja e os próprios pedidos */
  if (who.role === "vendedor") {
    if ((col === "catalogo" || (col === "loja" && id === "geral")) && m === "GET") {
      if (!id) return json(await listDocs(env, col));
      const d = await getDoc(env, col, id);
      return d ? json({ id, data: d }) : json({ error: "not_found" }, 404);
    }
    if (col === "pedidos") {
      if (m === "GET" && !id) {
        const { results } = await env.DB.prepare(
          "SELECT id, data FROM docs WHERE col = 'pedidos' AND json_extract(data, '$.vendedor') = ? ORDER BY updated_at"
        ).bind(who.email).all();
        return json(results.map((r) => ({ id: r.id, data: JSON.parse(r.data) })));
      }
      const existing = id ? await getDoc(env, "pedidos", id) : null;
      if (m === "GET") return existing && existing.vendedor === who.email ? json({ id, data: existing }) : json({ error: "not_found" }, 404);
      if (m === "PUT") return sellerPutPedido(env, who, id, body, existing);
      if (m === "DELETE") {
        if (!existing || existing.vendedor !== who.email) return json({ error: "not_found" }, 404);
        if (existing.status !== "novo") return json({ error: "pedido_em_producao" }, 409);
        await putDoc(env, "pedidos", id, { ...existing, status: "cancelado",
          historico: [...(existing.historico || []), { em: new Date().toISOString(), status: "cancelado", por: who.email }] });
        return json({ ok: true });
      }
    }
    return json({ error: "forbidden" }, 403);
  }

  /* admin */
  if (m === "GET" && !id) return json(await listDocs(env, col));
  if (m === "GET") {
    const d = await getDoc(env, col, id);
    return d ? json({ id, data: d }) : json({ error: "not_found" }, 404);
  }
  if (m === "PUT") {
    if (col === "acesso") {
      const admins = (Array.isArray(body.admins) ? body.admins : []).map((e) => String(e).trim().toLowerCase()).filter(Boolean).slice(0, 50);
      if (admins.length && !admins.includes(who.email)) return json({ error: "inclua_seu_email", email: who.email }, 400);
      const prev = (await getDoc(env, "acesso", "geral")) || {};
      let team = prev.team || null;
      if (admins.length && !team && who.jwt) {
        // Primeiro cadastro: guarda a equipe do Access e passa a conferir a assinatura do token.
        try {
          const iss = decodePart(who.jwt.split(".")[1]).iss;
          if (TEAM_RE.test(iss) && (await verifyJwt(who.jwt, iss))) team = iss;
        } catch {}
      }
      if (!admins.length) team = null;
      await putDoc(env, "acesso", "geral", { admins, team });
      return json({ ok: true, id, team: !!team });
    }
    if (col === "pedidos" && !body.numero) body.numero = (await getDoc(env, "pedidos", id))?.numero || (await nextNumero(env));
    await putDoc(env, col, id, body);
    return json({ ok: true, id, numero: body.numero });
  }
  if (m === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM docs WHERE col = ? AND id = ?").bind(col, id).run();
    return json({ ok: true });
  }
  return json({ error: "method_not_allowed" }, 405);
}

async function foto(request, env, id) {
  if (!ID_RE.test(id)) return new Response("not found", { status: 404 });
  const who = await identify(request, env);
  if (!who.role) return new Response("forbidden", { status: 403 });
  const d = await getDoc(env, "fotos", id);
  const m = d && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(d.data || "");
  if (!m) return new Response("not found", { status: 404 });
  return new Response(b64url(m[2].replace(/\+/g, "-").replace(/\//g, "_")), {
    headers: { "content-type": m[1], "cache-control": "private, max-age=86400" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await api(request, env, url);
      if (url.pathname.startsWith("/foto/")) return await foto(request, env, url.pathname.slice(6));
    } catch (e) {
      return json({ error: "server_error" }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};
