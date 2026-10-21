// Public page directory: metadata only. Never expose drafts, members-only content,
// source snapshots, or editor HTML through this unauthenticated endpoint.
const respond = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": status === 200 ? "public, max-age=60, s-maxage=60" : "no-store",
    "x-content-type-options": "nosniff"
  }
});

function boundedInteger(raw, fallback, min, max) {
  if (raw === null) return fallback;
  if (!/^[0-9]+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

export async function onRequestGet({ request, env }) {
  if (!env.HGLOBAL_DB) return respond({ error: "database_unavailable" }, 503);
  const url = new URL(request.url);
  const limit = boundedInteger(url.searchParams.get("limit"), 20, 1, 50);
  const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, 10000);
  if (limit === null || offset === null) {
    return respond({ error: "invalid_pagination" }, 400);
  }
  try {
    const result = await env.HGLOBAL_DB.prepare(
      "SELECT public_id, title, menu_key, sort_order, updated_at FROM pages WHERE status = 'published' AND access_level = 'public' ORDER BY menu_key ASC, sort_order ASC, public_id ASC LIMIT ? OFFSET ?"
    ).bind(limit, offset).all();
    const data = result.results || [];
    return respond({ data, pagination: { limit, offset, count: data.length } });
  } catch {
    return respond({ error: "pages_temporarily_unavailable" }, 503);
  }
}
