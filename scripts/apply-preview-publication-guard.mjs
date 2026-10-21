// H-Global Preview-only CMS publication safety migration. No page is published.
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const database='hglobal-preview-db';
const file='migrations/0005_cms_publication_review.sql';
const version='0005_cms_publication_review';
if(!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)
  throw Error('H-Global Preview-only Cloudflare credentials are missing');
const checksum=createHash('sha256').update(await readFile(file,'utf8')).digest('hex');
function command(args,asJson=false){
 const r=spawnSync('npx',['--no-install','wrangler','d1','execute',database,'--remote','--yes',...args],
  {encoding:'utf8',timeout:120000,env:process.env});
 if(r.error || r.status!==0) throw Error('Preview D1 migration failed: '+String(r.error?.message||r.stderr||r.stdout).slice(-1200));
 if(!asJson)return null;
 let parsed;
 try{parsed=JSON.parse(r.stdout)}catch{throw Error('Malformed Cloudflare D1 JSON')}
 const item=Array.isArray(parsed)?parsed[0]:parsed;
 if(!item || item.success===false || !Array.isArray(item.results))throw Error('D1 query unsuccessful');
 return item.results[0]??null;
}
const query=sql=>command(['--command',sql,'--json'],true);
const applied=query("SELECT checksum FROM schema_migrations WHERE version='"+version+"' LIMIT 1");
if(applied && applied.checksum!==checksum)throw Error('Recorded publication migration checksum mismatch');
if(!applied){
 const old=query(`SELECT
  (SELECT COUNT(*) FROM pages WHERE status='published' AND
   (source_wp_id IS NOT NULL OR COALESCE(source_snapshot,'')<>'')) AS unsafe_published,
  (SELECT COUNT(*) FROM pages WHERE status='published') AS currently_published`);
 if(!old || !Number.isInteger(old.unsafe_published)||!Number.isInteger(old.currently_published))
   throw Error('Unexpected schema or Preview D1 preflight data');
 if(old.unsafe_published>0)throw Error('Unreviewed legacy content is already published; review before applying guard');
 command(['--file',file]);
}
const installed=query(`SELECT
 (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='cms_publication_requests') AS tables,
 (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name IN
  ('trg_pages_deny_direct_publish_insert','trg_pages_require_two_person_review','trg_pages_protect_published_content')) AS triggers,
 (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_cms_one_pending_request_per_page') AS indexes`);
if(!installed || installed.tables!==1 || installed.triggers!==3 || installed.indexes!==1)
 throw Error('Two-person CMS publication protection not fully installed');
if(!applied) query("INSERT OR IGNORE INTO schema_migrations(version,checksum) VALUES ('"+version+"','"+checksum+"') RETURNING version");
console.log('H-Global Preview D1 CMS publication protection verified; version='+version+'; no page content migrated or published');
