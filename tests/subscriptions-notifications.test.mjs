import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {SUBSCRIBE_SQL,UNSUBSCRIBE_SQL,onRequestPut,onRequestDelete} from '../functions/api/v1/subscriptions/[id].js';
import {MARK_READ_SQL,onRequestPatch} from '../functions/api/v1/notifications/[id].js';
import {onRequestGet as inbox} from '../functions/api/v1/notifications.js';

const schema=await readFile(new URL('../migrations/0001_initial_schema.sql',import.meta.url),'utf8');
const python=`
import json,sqlite3,sys
data=json.load(sys.stdin)
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
db.executescript(data['schema'])
db.execute("INSERT INTO members(id,external_subject) VALUES('owner','one'),('other','two')")
db.execute("INSERT INTO pages(id,public_id,title,menu_key,status,access_level) VALUES('pub','100','public','最新消息','published','public')")
db.execute("INSERT INTO pages(id,public_id,title,menu_key,status,access_level) VALUES('draft','101','draft','最新消息','draft','public')")
db.execute("INSERT INTO pages(id,public_id,title,menu_key,status,access_level) VALUES('private','102','private','最新消息','published','members')")
db.execute("INSERT INTO pages(id,public_id,title,menu_key,status,access_level,subscribable) VALUES('nosub','103','no','最新消息','published','public',0)")
sub,unsub,mark=data['subscribe'],data['unsubscribe'],data['mark']
assert db.execute(sub,('owner','100')).fetchone()['enabled']==1 if False else True
`;
const script=`
import json,sqlite3,sys
data=json.load(sys.stdin)
db=sqlite3.connect(':memory:')
db.row_factory=sqlite3.Row
db.execute('PRAGMA foreign_keys=ON')
db.executescript(data['schema'])
db.execute("INSERT INTO members(id,external_subject) VALUES('owner','one'),('other','two')")
for page,status,access,allowed in [('pub','published','public',1),('draft','draft','public',1),('private','published','members',1),('nosub','published','public',0)]:
 id={'pub':'100','draft':'101','private':'102','nosub':'103'}[page]
 db.execute("INSERT INTO pages(id,public_id,title,menu_key,status,access_level,subscribable) VALUES(?,?,?,?,?,?,?)",
  (page,id,page,'最新消息',status,access,allowed))
sub,unsub,mark=data['subscribe'],data['unsubscribe'],data['mark']
r=db.execute(sub,('owner','100')).fetchone()
assert r['enabled']==1 and r['channel_in_app']==1 and r['channel_push']==0 and r['channel_email']==0
assert db.execute(sub,('owner','100')).fetchone()['enabled']==1
for bad in ['101','102','103','999']:
 assert db.execute(sub,('owner',bad)).fetchone() is None
assert db.execute("SELECT COUNT(*) FROM subscriptions").fetchone()[0]==1
assert db.execute(unsub,('other','100')).fetchone() is None
assert db.execute("SELECT enabled FROM subscriptions WHERE member_id='owner'").fetchone()[0]==1
assert db.execute(unsub,('owner','100')).fetchone()['enabled']==0
assert db.execute(unsub,('owner','100')).fetchone()['enabled']==0
assert db.execute(sub,('owner','100')).fetchone()['enabled']==1
db.execute("INSERT INTO notifications(id,member_id,title,body) VALUES ('n1','owner','Hello','private'),('n2','other','Other','secret')")
assert db.execute(mark,('n1','other')).fetchone() is None
row=db.execute(mark,('n1','owner')).fetchone()
assert row['id']=='n1' and row['read_at']
assert db.execute(mark,('n1','owner')).fetchone() is None
assert db.execute("SELECT read_at FROM notifications WHERE id='n2'").fetchone()[0] is None
print('pass')
`;
test('D1 subscriptions enforce public published page and only in-app channel; notification owner boundary',()=>{
 const run=spawnSync('python3',['-c',script],{
  input:JSON.stringify({schema,subscribe:SUBSCRIBE_SQL,unsubscribe:UNSUBSCRIBE_SQL,mark:MARK_READ_SQL}),
  encoding:'utf8'
 });
 assert.equal(run.status,0,run.stderr||run.stdout);
 assert.match(run.stdout,/pass/);
});
test('anonymous users cannot access inbox or modify subscriptions',async()=>{
 const env={HGLOBAL_DB:{}};
 const get=new Request('https://preview.test/api/v1/notifications');
 const tests=[
  inbox({request:get,env}),
  onRequestPut({request:new Request('https://preview.test/',{method:'PUT'}),env,params:{id:'100'}}),
  onRequestDelete({request:new Request('https://preview.test/',{method:'DELETE'}),env,params:{id:'100'}}),
  onRequestPatch({request:new Request('https://preview.test/',{method:'PATCH'}),env,params:{id:'n1'}})
 ];
 for(const promise of tests){
  const res=await promise;
  assert.equal(res.status,401);
 }
});
