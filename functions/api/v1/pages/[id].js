// Public page detail. Unauthenticated visitors may read published public content only.
// Never return WordPress snapshots, revisions, draft HTML or private metadata.
const respond = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": status === 200 ? "public, max-age=60, s-maxage=60" : "no-store",
    "x-content-type-options": "nosniff"
  }
});

export async function onRequestGet({ params, env }) {
  const id = String(params?.id ?? "");
  if (!/^[0-9]{1,12}$/.test(id)) return respond({ error: "invalid_public_id" }, 400);
  if (!env.HGLOBAL_DB) return respond({ error: "database_unavailable" }, 503);
  try {
    const page = await env.HGLOBAL_DB.prepare(
      "SELECT public_id, title, menu_key, content_html, updated_at FROM pages WHERE public_id = ? AND status = 'published' AND access_level = 'public' LIMIT 1"
    ).bind(id).first();
    if (!page) return respond({ error: "page_not_found" }, 404);
    return respond({ data: page });
  } catch {
    return respond({ error: "page_temporarily_unavailable" }, 503);
  }
}
