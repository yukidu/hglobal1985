// Only H-Global Preview D1; never alter Starry ID central or Production database.
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const db='hglobal-preview-db',version='0007_hglobal_sessions',file='migrations/0007_hglobal_sessions.sql';
if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)
 throw Error('Missing Preview Cloudflare deployment credentials');
const hash=createHash('sha256').update(await readFile(file,'utf8')).digest('hex');
function run(args,json=false){
 const r=spawnSync('npx',['--no-install','wrangler','d1','execute',db,'--remote','--yes',...args],
  {encoding:'utf8',timeout:120000,env:process.env});
 if(r.error||r.status!==0)throw Error('H-Global Preview D1 session migration failed: '+(r.error?.message||r.stderr||r.stdout).slice(-1200));
 if(!json)return null;
 let out;
 try{out=JSON.parse(r.stdout)}catch{throw Error('Bad D1 JSON response')}
 const v=Array.isArray(out)?out[0]:out;
 if(v?.success===false||!Array.isArray(v?.results))throw Error('D1 query unsuccessful');
 return v.results[0]??null;
}
const query=s=>run(['--command',s,'--json'],true);
const existing=query("SELECT checksum FROM schema_migrations WHERE version='"+version+"' LIMIT 1");
if(existing&&existing.checksum!==hash)throw Error('Migration checksum mismatch');
if(!existing)run(['--file',file]);
const found=query("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='hglobal_auth_sessions'");
if(found?.count!==1)throw Error('Expected H-Global session table is missing');
if(!existing)query("INSERT OR IGNORE INTO schema_migrations(version,checksum) VALUES ('"+version+"','"+hash+"') RETURNING version");
console.log('H-Global Preview revocable sessions schema installed; no user session or SSO secret created');
