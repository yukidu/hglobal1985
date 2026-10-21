// Deploy only H-Global Preview D1 registration safety guards after inspecting data.
// Intentionally refuses to touch Production or any Starry-owned database.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const database='hglobal-preview-db',version='0004_registration_capacity_guard',
  file='migrations/0004_registration_capacity_guard.sql';
if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)
  throw Error('Missing Cloudflare Preview credentials');
const checksum=createHash('sha256').update(await readFile(file,'utf8')).digest('hex');
function wrangler(args,asJson=false){
 const res=spawnSync('npx',['--no-install','wrangler','d1','execute',database,'--remote','--yes',...args],
   {encoding:'utf8',timeout:120000,env:process.env});
 if(res.error||res.status!==0)throw Error('Preview D1 migration operation failed: '+(res.error?.message||res.stderr||res.stdout).slice(-1200));
 if(!asJson)return null;
 let parsed;
 try{parsed=JSON.parse(res.stdout)}catch{throw Error('Unexpected D1 response')}
 const item=Array.isArray(parsed)?parsed[0]:parsed;
 if(!item||item.success===false||!Array.isArray(item.results))throw Error('Preview D1 returned query error');
 return item.results[0]??null;
}
const query=sql=>wrangler(['--command',sql,'--json'],true);
const current=query("SELECT checksum FROM schema_migrations WHERE version='"+version+"' LIMIT 1");
if(current && current.checksum!==checksum)throw Error('Migration changed; refusing overwrite');
if(!current){
 const preflight=query(`SELECT
  (SELECT COUNT(*) FROM event_registrations r LEFT JOIN event_sessions s ON r.session_id=s.id
   WHERE r.status IN ('submitted','confirmed','waitlisted') AND
     (r.member_id IS NULL OR s.id IS NULL OR s.event_id<>r.event_id)) AS invalid_registrations,
  (SELECT COUNT(*) FROM (SELECT event_id,session_id,member_id,COUNT(*) AS qty
    FROM event_registrations WHERE status IN ('submitted','confirmed','waitlisted')
    AND member_id IS NOT NULL AND session_id IS NOT NULL
    GROUP BY event_id,session_id,member_id HAVING qty>1)) AS duplicates,
  (SELECT COUNT(*) FROM event_sessions s WHERE s.capacity IS NOT NULL AND
    (SELECT COUNT(*) FROM event_registrations r WHERE r.session_id=s.id
     AND r.status IN ('submitted','confirmed'))>s.capacity) AS over_capacity`);
 if(!preflight || !['invalid_registrations','duplicates','over_capacity'].every(k=>Number.isInteger(preflight[k])))
   throw Error('Preview D1 preflight structure invalid');
 if(preflight.invalid_registrations||preflight.duplicates||preflight.over_capacity)
   throw Error('Existing registration conflicts require manual review before migration');
 wrangler(['--file',file]);
}
const verified=query("SELECT COUNT(*) AS guard_count FROM sqlite_master WHERE (type='trigger' AND name IN ('trg_event_registration_guard_insert','trg_event_registration_guard_update')) OR (type='index' AND name='idx_event_registrations_unique_active_member_session')");
if(Number(verified?.guard_count)!==3)throw Error('Registration safety guards not fully installed');
if(!current)query("INSERT OR IGNORE INTO schema_migrations(version,checksum) VALUES ('"+version+"','"+checksum+"') RETURNING version");
console.log('H-Global Preview D1 registration capacity and duplicate guard verified; version='+version);
