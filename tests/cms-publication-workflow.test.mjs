import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {
  SUBMIT_SQL,APPROVE_SQL,PUBLISH_SQL,PUBLISH_AUDIT_SQL,
  REJECT_SQL,REJECT_AUDIT_SQL,onRequestGet,onRequestPost
} from '../functions/api/v1/admin/page-publications.js';

const schema=await readFile(new URL('../migrations/0001_initial_schema.sql',import.meta.url),'utf8');
const guard=await readFile(new URL('../migrations/0005_cms_publication_review.sql',import.meta.url),'utf8');
const python=`
import sqlite3,json,sys
x=json.load(sys.stdin)
db=sqlite3.connect(':memory:')
db.row_factory=sqlite3.Row
db.execute('PRAGMA foreign_keys=ON')
db.executescript(x['schema'])
db.executescript(x['guard'])
for name in ['author','reviewer']:
 db.execute("INSERT INTO members(id,external_subject) VALUES (?,?)",(name,name+'-sub'))
for page,public in [('p1','100'),('p2','200'),('p3','300')]:
 db.execute("INSERT INTO pages(id,public_id,title,menu_key,status,access_level) VALUES (?,?,'Title','首頁','draft','public')",(page,public))
 db.execute("INSERT INTO page_revisions(id,page_id,revision_no,title,content_html,changed_by) VALUES (?,?,1,'Title','','author')",(page+'rev',page))
db.commit()
def run(sql,values):
 return db.execute(sql,values).fetchone()
submit=x['submit'];approve=x['approve'];publish=x['publish'];audit=x['publish_audit']
reject=x['reject'];reject_audit=x['reject_audit']
assert run(submit,('q1',1,'author','100',1,1))['status']=='pending'
assert run(approve,('author','q1','author')) is None
assert run(publish,('author','q1','author')) is None
assert db.execute("SELECT status FROM pages WHERE id='p1'").fetchone()[0]=='draft'
assert run(approve,('reviewer','q1','reviewer'))['id']=='q1'
assert run(publish,('reviewer','q1','reviewer'))['status']=='published'
assert run(audit,('audit1','reviewer','{}','q1','reviewer'))['id']=='audit1'
assert db.execute("SELECT COUNT(*) FROM audit_logs WHERE entity_id='p1'").fetchone()[0]==1
# A new draft revision makes a previously submitted request stale.
assert run(submit,('q2',1,'author','200',1,1))['status']=='pending'
db.execute("INSERT INTO page_revisions(id,page_id,revision_no,title,content_html,changed_by) VALUES ('p2rev2','p2',2,'Title','','author')")
assert run(approve,('reviewer','q2','reviewer')) is None
assert run(publish,('reviewer','q2','reviewer')) is None
assert db.execute("SELECT status FROM pages WHERE id='p2'").fetchone()[0]=='draft'
# Reviewer can reject a pending request; rejection never publishes the page.
assert run(submit,('q3',1,'author','300',1,1))['status']=='pending'
assert run(reject,('reviewer','Fix copy','q3','reviewer'))['status']=='rejected'
assert run(reject_audit,('audit3','reviewer','{}','q3','reviewer'))['id']=='audit3'
assert db.execute("SELECT status FROM pages WHERE id='p3'").fetchone()[0]=='draft'
print('pass')
`;
test('SQLite publication review workflow prevents self approval, stale approval and rejected publication',()=>{
 const p=spawnSync('python3',['-c',python],{
  input:JSON.stringify({schema,guard,submit:SUBMIT_SQL,approve:APPROVE_SQL,
    publish:PUBLISH_SQL,publish_audit:PUBLISH_AUDIT_SQL,
    reject:REJECT_SQL,reject_audit:REJECT_AUDIT_SQL}),
  encoding:'utf8'
 });
 assert.equal(p.status,0,p.stderr||p.stdout);
 assert.match(p.stdout,/pass/);
});
test('publication administration denies anonymous GET/POST',async()=>{
 const env={HGLOBAL_DB:{}};
 const resultGet=await onRequestGet({
  request:new Request('https://preview.test/api/v1/admin/page-publications'),env
 });
 assert.equal(resultGet.status,401);
 const resultPost=await onRequestPost({
  request:new Request('https://preview.test/api/v1/admin/page-publications',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({action:'approve',request_id:'q1'})
  }),env
 });
 assert.equal(resultPost.status,401);
});
