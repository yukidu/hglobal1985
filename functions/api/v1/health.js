const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }
});

export async function onRequestGet({ env }) {
  if (!env.HGLOBAL_DB) {
    return json({ ok: false, database: "not_bound", environment: "preview" }, 503);
  }
  try {
    const row = await env.HGLOBAL_DB
      .prepare("SELECT version, applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 1")
      .first();
    return json({ ok: true, service: "hglobal-api", database: "connected", schema: row || null }, 200);
  } catch {
    return json({ ok: false, service: "hglobal-api", database: "unavailable" }, 503);
  }
}
