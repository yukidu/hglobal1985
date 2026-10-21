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
const listingScript = await get('/live-listings.js');
if (!listingScript.ok) throw Error('Public listing script HTTP ' + listingScript.status);
const scriptText = await listingScript.text();
if (!scriptText.includes('window.hglobalRefresh')) throw Error('Public listing script is not current');
if (!html.includes('src="/live-listings.js"')) throw Error('Homepage does not load public listings');
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
const detailInvalid = await get('/api/v1/page?public_id=bad');
if (detailInvalid.status !== 400) throw Error('Page detail accepted invalid public ID');
for (const endpoint of ['news', 'events', 'venues']) {
  const listing = await get('/api/v1/' + endpoint + '?limit=1&offset=0');
  if (!listing.ok) throw Error(endpoint + ' API failed: HTTP ' + listing.status);
  const result = await listing.json();
  if (!Array.isArray(result.data)) throw Error(endpoint + ' API missing data array');
  const rejected = await get('/api/v1/' + endpoint + '?limit=0');
  if (rejected.status !== 400) throw Error(endpoint + ' accepted invalid pagination');
}
// Phase-1 feature acceptance: newly deployed public endpoints must be present
// and must reject malformed parameters before consulting private data.
const invalidEvent = await get('/api/v1/event-sessions?event_id=..%2Fprivate');
if (invalidEvent.status !== 400) throw Error('Event sessions API missing or accepted malformed event ID');
const eventSessions = await get('/api/v1/event-sessions?event_id=preview-unknown-event-20261021');
if (![200, 404].includes(eventSessions.status)) throw Error('Event sessions API unhealthy: HTTP ' + eventSessions.status);
if (eventSessions.status === 200) {
  const data = await eventSessions.json();
  if (!Array.isArray(data.sessions)) throw Error('Event sessions API shape invalid');
}
const invalidVenue = await get('/api/v1/venue-availability?venue_id=venue&from=2026-02-30&to=2026-03-01');
if (invalidVenue.status !== 400) throw Error('Venue availability API missing or accepted invalid date');
const venueSlots = await get('/api/v1/venue-availability?venue_id=preview-unknown-venue-20261021&from=2026-10-21&to=2026-10-22');
if (![200, 404].includes(venueSlots.status)) throw Error('Venue availability API unhealthy: HTTP ' + venueSlots.status);
if (venueSlots.status === 200) {
  const data = await venueSlots.json();
  if (!Array.isArray(data.slots)) throw Error('Venue availability API shape invalid');
}
const invalid = await get('/api/v1/pages?limit=0');
if (invalid.status !== 400) throw Error('Invalid pagination was not rejected');
console.log('Preview verified:', origin, 'D1 connected, live listing JS and page/news/events/venues APIs safe, noindex set');
