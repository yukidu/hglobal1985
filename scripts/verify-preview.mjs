// Cloudflare Preview deployment acceptance gate.
// Uses the exact deployment URL emitted by Wrangler, not a guessed branch alias.
const url = process.env.PREVIEW_URL;
if (!url || !/^https:\/\/[a-z0-9-]+\.hglobal-preview\.pages\.dev\/?$/i.test(url)) {
  throw Error('Missing or invalid Cloudflare Preview deployment URL');
}
const origin = new URL(url).origin;
async function get(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try { return await fetch(origin + path, { signal: controller.signal, redirect: 'error' }); }
  finally { clearTimeout(timeout); }
}
const page = await get('/');
if (!page.ok) throw Error('Preview homepage HTTP ' + page.status);
const html = await page.text();
if (!html.includes('noindex,nofollow')) throw Error('Preview noindex requirement missing');
if (!html.includes('架構預覽版')) throw Error('Latest preview commit not visible');
const health = await get('/api/v1/health');
const status = await health.json();
if (!health.ok || status.ok !== true || status.database !== 'connected') {
  throw Error('Preview D1 health failed: HTTP ' + health.status);
}
const pages = await get('/api/v1/pages?limit=1&offset=0');
if (!pages.ok) throw Error('Pages API failed: HTTP ' + pages.status);
const body = await pages.json();
if (!Array.isArray(body.data)) throw Error('Pages API missing data array');
for (const item of body.data) {
  if ('source_snapshot' in item || 'content_html' in item) throw Error('Private CMS content leaked');
}
const invalid = await get('/api/v1/pages?limit=0');
if (invalid.status !== 400) throw Error('Invalid pagination was not rejected');
console.log('Preview verified:', origin, 'D1 connected, public pages API safe, noindex set');
