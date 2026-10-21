// Create private review-only staging tables in isolated H-Global Preview D1.
// No user content is read from local files or copied to Cloudflare by this script.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const database='hglobal-preview-db';
const version='0002_legacy_import_staging';
const file='migrations/0002_legacy_import_staging.sql';
if(!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw Error('Missing scoped Cloudflare Preview credentials');
}
const checksum=createHash('sha256').update(await readFile(file,'utf8')).digest('hex');
function run(args,json=false) {
  const out=spawnSync('npx',['--no-install','wrangler','d1','execute',database,'--remote','--yes',...args],
    {encoding:'utf8',timeout:120000,env:process.env});
  if(out.error || out.status!==0) throw Error('Preview D1 staging migration failed: '+(out.error?.message ?? out.stderr ?? out.stdout).slice(-1500));
  if(!json) return null;
  let parsed;
  try { parsed=JSON.parse(out.stdout); } catch { throw Error('Invalid D1 JSON response'); }
  const item=Array.isArray(parsed)?parsed[0]:parsed;
  if(!item || item.success===false || !Array.isArray(item.results)) throw Error('D1 query unsuccessful');
  return item.results[0] ?? null;
}
const query=q=>run(['--command',q,'--json'],true);
const existing=query("SELECT checksum FROM schema_migrations WHERE version='"+version+"' LIMIT 1");
if(existing && existing.checksum!==checksum) throw Error('Legacy migration checksum mismatch');
if(!existing) run(['--file',file]);
const tableCount=query("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('legacy_import_batches','legacy_source_pages','legacy_source_revisions','legacy_media_audit')");
if(Number(tableCount?.count)!==4) throw Error('Legacy staging schema incomplete; migration not recorded');
if(!existing) query("INSERT OR IGNORE INTO schema_migrations(version,checksum) VALUES ('"+version+"','"+checksum+"') RETURNING version");
console.log('H-Global Preview D1 private legacy staging schema verified; version='+version+'; no pages published');
