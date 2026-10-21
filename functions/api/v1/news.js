const json = (data, status = 200) => new Response(JSON.stringify(data), {
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

export async function onRequestGet({ env, request }) {
  if (!env.HGLOBAL_DB) return json({ error: "preview_database_not_bound" }, 503);
  const url = new URL(request.url);
  const limit = boundedInteger(url.searchParams.get("limit"), 20, 1, 50);
  const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, 10000);
  if (limit === null || offset === null) return json({ error: "invalid_pagination" }, 400);
  try {
    const result = await env.HGLOBAL_DB.prepare(
      "SELECT id, title, category, summary, pinned, published_at FROM news_items WHERE status = 'published' ORDER BY pinned DESC, published_at DESC LIMIT ? OFFSET ?"
    ).bind(limit, offset).all();
    return json({ data: result.results || [], pagination: { limit, offset, count: (result.results || []).length } });
  } catch {
    return json({ error: "news_temporarily_unavailable" }, 503);
  }
}
