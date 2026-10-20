const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=60, s-maxage=60",
    "x-content-type-options": "nosniff"
  }
});

export async function onRequestGet({ env, request }) {
  if (!env.HGLOBAL_DB) return json({ error: "preview_database_not_bound" }, 503);
  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20));
  const offset = Math.min(10000, Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0));
  try {
    const result = await env.HGLOBAL_DB.prepare(
      "SELECT id, name, address_text, timezone, sort_order FROM venues WHERE status = 'active' ORDER BY sort_order ASC, name ASC LIMIT ? OFFSET ?"
    ).bind(limit, offset).all();
    return json({ data: result.results || [], pagination: { limit, offset, count: (result.results || []).length } });
  } catch {
    return json({ error: "venues_temporarily_unavailable" }, 503);
  }
}
