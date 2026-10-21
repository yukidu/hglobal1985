// Enable automatic in-app notifications in the isolated H-Global Preview D1.
// No email, Web Push or LINE delivery is performed by this migration.
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const db='hglobal-preview-db',version='0006_inapp_notifications',file='migrations/0006_inapp_notifications.sql';
if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)
 throw Error('Missing Cloudflare Preview credentials');
const checksum=createHash('sha256').update(await readFile(file,'utf8')).digest('hex');
function exec(args,json=false){
 const p=spawnSync('npx',['--no-install','wrangler','d1','execute',db,'--remote','--yes',...args],
   {encoding:'utf8',timeout:120000,env:process.env});
 if(p.error||p.status!==0)throw Error('H-Global Preview D1 notification migration failed: '+(p.error?.message||p.stderr||p.stdout).slice(-1200));
 if(!json)return null;
 let parsed;
 try{parsed=JSON.parse(p.stdout)}catch{throw Error('Invalid D1 JSON')}
 const record=Array.isArray(parsed)?parsed[0]:parsed;
 if(record?.success===false||!Array.isArray(record?.results))throw Error('D1 query failed');
 return record.results[0]??null;
}
const query=s=>exec(['--command',s,'--json'],true);
const applied=query("SELECT checksum FROM schema_migrations WHERE version='"+version+"' LIMIT 1");
if(applied&&applied.checksum!==checksum)throw Error('Migration checksum mismatch');
if(!applied)exec(['--file',file]);
const found=query("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_event_registration_notice_created','trg_event_registration_notice_status','trg_venue_booking_notice_created','trg_venue_booking_notice_status')");
if(found?.count!==4)throw Error('Four member notification triggers were not installed');
if(!applied)query("INSERT OR IGNORE INTO schema_migrations(version,checksum) VALUES ('"+version+"','"+checksum+"') RETURNING version");
console.log('H-Global Preview D1 in-app status notifications ready; no messages sent outside the app');
