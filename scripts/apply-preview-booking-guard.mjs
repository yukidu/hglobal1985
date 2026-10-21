// Apply only the idempotent venue-overlap guard to the isolated H-Global Preview D1.
// Runs in GitHub Actions with scoped secrets. Never touches Production or other apps.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const db = 'hglobal-preview-db';
const version = '0003_venue_booking_overlap_guard';
const file = 'migrations/0003_venue_booking_overlap_guard.sql';
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw Error('Missing scoped Cloudflare Preview credentials');
}
const sql = await readFile(file,'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');

function wrangler(args, expectJson = false) {
  const out = spawnSync('npx',['--no-install','wrangler','d1','execute',db,'--remote','--yes',...args], {
    encoding:'utf8', timeout:120000, env:process.env
  });
  if (out.error || out.status !== 0) throw Error('Preview D1 operation failed: '+(out.error?.message ?? out.stderr ?? out.stdout).slice(-1500));
  if (!expectJson) return null;
  let data;
  try { data = JSON.parse(out.stdout); }
  catch { throw Error('Preview D1 returned an unexpected JSON response'); }
  const item = Array.isArray(data) ? data[0] : data;
  if (!item || item.success === false || !Array.isArray(item.results)) throw Error('Preview D1 query unsuccessful');
  return item.results[0] ?? null;
}
function query(q) { return wrangler(['--command',q,'--json'],true); }

const current = query("SELECT checksum FROM schema_migrations WHERE version='"+version+"' LIMIT 1");
if (current) {
  if (current.checksum !== checksum) throw Error('Migration checksum changed after being recorded; refusing to overwrite');
} else {
  const preflight = query(`SELECT
    (SELECT COUNT(*) FROM venue_bookings WHERE status IN ('pending','approved') AND starts_at >= ends_at) AS invalid_intervals,
    (SELECT COUNT(*) FROM venue_bookings a JOIN venue_bookings b ON a.id < b.id AND a.venue_id=b.venue_id
     WHERE a.status IN ('pending','approved') AND b.status IN ('pending','approved')
       AND a.starts_at < b.ends_at AND b.starts_at < a.ends_at) AS overlaps,
    (SELECT COUNT(*) FROM venue_bookings b WHERE b.status IN ('pending','approved') AND b.slot_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM venue_slots s WHERE s.id=b.slot_id AND s.venue_id=b.venue_id
        AND s.status='available' AND s.starts_at=b.starts_at AND s.ends_at=b.ends_at)) AS wrong_slots`);
  if (!preflight || !['invalid_intervals','overlaps','wrong_slots'].every(k => Number.isInteger(preflight[k]))) {
    throw Error('Preflight schema/result did not match expected H-Global Preview');
  }
  if (preflight.invalid_intervals || preflight.overlaps || preflight.wrong_slots) {
    throw Error('Existing booking conflicts found; migration blocked until data reviewed');
  }
  wrangler(['--file',file]);
}

const guards = query("SELECT COUNT(*) AS guard_count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_venue_bookings_guard_insert','trg_venue_bookings_guard_update')");
if (Number(guards?.guard_count) !== 2) throw Error('Preview D1 missing at least one booking trigger');
if (!current) {
  query("INSERT OR IGNORE INTO schema_migrations(version, checksum) VALUES ('"+version+"','"+checksum+"') RETURNING version");
}
console.log('H-Global Preview D1 booking guard verified; version='+version+'; database='+db);
