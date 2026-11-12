// Cotador 3D — Worker: serve a página (pasta public/) e a API de dados no D1.
// Rotas: GET /api/:col  ·  GET|PUT|DELETE /api/:col/:id   (col = config | filamentos | orcamentos)

const COLS = new Set(["config", "filamentos", "orcamentos"]);
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BYTES = 256 * 1024;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function api(request, env, url) {
  const parts = url.pathname.slice("/api/".length).split("/").filter(Boolean);
  const [col, id] = parts;
  if (!COLS.has(col) || parts.length > 2 || (id && !ID_RE.test(id))) return json({ error: "not_found" }, 404);

  const m = request.method;

  if (m === "GET" && !id) {
    const { results } = await env.DB.prepare("SELECT id, data FROM docs WHERE col = ? ORDER BY updated_at")
      .bind(col).all();
    return json(results.map((r) => ({ id: r.id, data: JSON.parse(r.data) })));
  }

  if (m === "GET") {
    const r = await env.DB.prepare("SELECT id, data FROM docs WHERE col = ? AND id = ?").bind(col, id).first();
    return r ? json({ id: r.id, data: JSON.parse(r.data) }) : json({ error: "not_found" }, 404);
  }

  if (m === "PUT" && id) {
    const text = await request.text();
    if (text.length > MAX_BYTES) return json({ error: "too_large" }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: "invalid_json" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_body" }, 400);
    await env.DB.prepare(
      `INSERT INTO docs (col, id, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).bind(col, id, JSON.stringify(body), new Date().toISOString()).run();
    return json({ ok: true, id });
  }

  if (m === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM docs WHERE col = ? AND id = ?").bind(col, id).run();
    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(request, env, url);
      } catch (e) {
        return json({ error: "server_error" }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
