// Public page reader: published/public content only. Never return editor metadata or snapshots.
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': status === 200 ? 'public, max-age=60, s-maxage=60' : 'no-store',
    'x-content-type-options': 'nosniff'
  }
});
export async function onRequestGet({ request, env }) {
  if (!env.HGLOBAL_DB) return json({ error: 'database_unavailable' }, 503);
  const params = new URL(request.url).searchParams;
  const publicId = params.get('public_id');
  if (!publicId || !/^[0-9]{1,12}$/.test(publicId)) return json({ error: 'invalid_public_id' }, 400);
  try {
    const page = await env.HGLOBAL_DB.prepare(
      "SELECT public_id, title, menu_key, content_html, share_enabled, subscribable, updated_at FROM pages WHERE public_id = ? AND status = 'published' AND access_level = 'public' LIMIT 1"
    ).bind(publicId).first();
    if (!page) return json({ error: 'page_not_found' }, 404);
    return json({ page });
  } catch {
    return json({ error: 'page_temporarily_unavailable' }, 503);
  }
}
