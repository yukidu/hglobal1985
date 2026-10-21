import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const schema=await readFile(new URL('../migrations/0001_initial_schema.sql',import.meta.url),'utf8');
const guard=await readFile(new URL('../migrations/0005_cms_publication_review.sql',import.meta.url),'utf8');
const source=`
import sqlite3,json,sys
x=json.load(sys.stdin)
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
db.executescript(x['schema'])
db.executescript(x['guard'])
db.execute("INSERT INTO members(id,external_subject) VALUES('author','author-sub'),('reviewer','reviewer-sub')")
def denied(sql):
 try:db.execute(sql)
 except sqlite3.IntegrityError:return
 raise AssertionError('Expected failure: '+sql)
denied("INSERT INTO pages(id,public_id,title,menu_key,status) VALUES('bad','333','bad','最新消息','published')")
db.execute("INSERT INTO pages(id,public_id,title,menu_key,status) VALUES('p1','100','draft','最新消息','draft')")
db.execute("INSERT INTO page_revisions(id,page_id,revision_no,title,content_html,changed_by) VALUES('r1','p1',1,'draft','','author')")
denied("UPDATE pages SET status='published' WHERE id='p1'")
db.execute("INSERT INTO cms_publication_requests(id,page_id,revision_no,requested_by,status) VALUES('q1','p1',1,'author','pending')")
denied("UPDATE pages SET status='published' WHERE id='p1'")
denied("UPDATE cms_publication_requests SET status='approved',reviewer_id='author' WHERE id='q1'")
db.execute("UPDATE cms_publication_requests SET status='approved',reviewer_id='reviewer' WHERE id='q1'")
db.execute("UPDATE pages SET status='published' WHERE id='p1'")
denied("UPDATE pages SET title='tampered' WHERE id='p1'")
denied("UPDATE pages SET content_html='<script>x</script>' WHERE id='p1'")
db.execute("INSERT INTO pages(id,public_id,title,menu_key,status) VALUES('p2','200','draft','最新消息','draft')")
db.execute("INSERT INTO page_revisions(id,page_id,revision_no,title,content_html,changed_by) VALUES('r2','p2',1,'draft','','author')")
db.execute("INSERT INTO cms_publication_requests(id,page_id,revision_no,requested_by,status,reviewer_id) VALUES('q2','p2',1,'author','approved','reviewer')")
db.execute("INSERT INTO page_revisions(id,page_id,revision_no,title,content_html,changed_by) VALUES('r3','p2',2,'new title','','author')")
db.execute("UPDATE pages SET title='new title' WHERE id='p2'")
denied("UPDATE pages SET status='published' WHERE id='p2'")
db.execute("INSERT INTO pages(id,public_id,title,menu_key,status,source_wp_id) VALUES('p3','300','legacy','最新消息','draft',123)")
db.execute("INSERT INTO page_revisions(id,page_id,revision_no,title,content_html,changed_by) VALUES('r4','p3',1,'legacy','','author')")
db.execute("INSERT INTO cms_publication_requests(id,page_id,revision_no,requested_by,status,reviewer_id) VALUES('q3','p3',1,'author','approved','reviewer')")
denied("UPDATE pages SET status='published' WHERE id='p3'")
print('pass')
`;
test('real SQLite enforces independent CMS reviewer, current revision, legacy safety and published immutability',()=>{
 const p=spawnSync('python3',['-c',source],{input:JSON.stringify({schema,guard}),encoding:'utf8'});
 assert.equal(p.status,0,p.stderr||p.stdout);
 assert.match(p.stdout,/pass/);
});
