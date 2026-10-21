import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {draftPatchStatements,onRequestGet,onRequestPatch} from '../functions/api/v1/admin/page-drafts/[id].js';

const schema=await readFile(new URL('../migrations/0001_initial_schema.sql',import.meta.url),'utf8');
function entries(revision,suffix='') {
 return draftPatchStatements({
  id:'007',memberId:'admin1',
  input:{title:revision===1?'第二版':'第三版',menu_key:'關於寰宇',text:'<img onerror=alert(1)> & 內容'},
  expectedRevision:revision,changeNote:'版本編輯',
  revisionId:'rev'+(revision+1)+suffix,auditId:'audit'+(revision+1)+suffix
 });
}
test('CMS draft revision updates atomically; stale editor cannot overwrite or write audit',()=>{
 const script=`
import json,sqlite3,sys
x=json.load(sys.stdin)
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
db.executescript(x['schema'])
db.execute("INSERT INTO members(id, external_subject) VALUES('admin1','central-sub')")
db.execute("INSERT INTO pages(id,public_id,title,menu_key,status,access_level,created_by,updated_by) VALUES ('page1','007','第一版','關於寰宇','draft','public','admin1','admin1')")
db.execute("INSERT INTO page_revisions(id,page_id,revision_no,title,content_html,changed_by) VALUES ('rev1','page1',1,'第一版','<p>第一版</p>','admin1')")
db.commit()
def apply(statements):
 result=[]
 with db:
  for row in statements:
   before=db.total_changes
   db.execute(row['sql'],row['binds'])
   result.append(db.total_changes-before)
 return result
assert apply(x['first'])==[1,1,1]
assert apply(x['stale'])==[0,0,0]
assert apply(x['third'])==[1,1,1]
page=db.execute("SELECT title,content_html,status FROM pages WHERE public_id='007'").fetchone()
assert page[0]=='第三版' and page[2]=='draft',page
assert '&lt;img' in page[1] and '<img' not in page[1]
assert db.execute("SELECT COUNT(*) FROM page_revisions WHERE page_id='page1'").fetchone()[0]==3
assert db.execute("SELECT COUNT(*) FROM audit_logs WHERE entity_id='page1'").fetchone()[0]==2
print('pass')
`;
 const r=spawnSync('python3',['-c',script],{
  input:JSON.stringify({schema,first:entries(1),stale:entries(1,'-stale'),third:entries(2)}),
  encoding:'utf8'
 });
 assert.equal(r.status,0,r.stderr||r.stdout);
 assert.match(r.stdout,/pass/);
});
test('anonymous CMS revisions cannot be read or mutated',async()=>{
 const env={HGLOBAL_DB:{}};
 for(const fn of [onRequestGet,onRequestPatch]){
  const request=new Request('https://preview.test/api/v1/admin/page-drafts/007',
   fn===onRequestPatch?{method:'PATCH'}:{});
  const result=await fn({request,env,params:{id:'007'}});
  assert.equal(result.status,401);
  assert.equal((await result.json()).error,'authentication_required');
 }
});
test('draft revision SQL never publishes or accesses legacy source snapshots',()=>{
 const sql=entries(1).map(x=>x.sql).join('\n');
 assert.match(sql,/status='draft'/);
 assert.doesNotMatch(sql,/status\s*=\s*'published'|source_snapshot|source_html|legacy_source_pages/);
 assert.match(sql,/COALESCE\(MAX\(r.revision_no\),0\)/);
 assert.match(sql,/INSERT INTO audit_logs/);
});
