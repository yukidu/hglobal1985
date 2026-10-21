import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {normalizeAnswers} from '../functions/_lib/event-form.js';

const schema=await readFile(new URL('../migrations/0001_initial_schema.sql',import.meta.url),'utf8');
const guard=await readFile(new URL('../migrations/0004_registration_capacity_guard.sql',import.meta.url),'utf8');
const fields=[
 {id:'f1',field_key:'full_name',label:'姓名',field_type:'text',required:1,options_json:'[]'},
 {id:'f2',field_key:'meal',label:'餐點',field_type:'select',required:1,options_json:'["素食","一般"]'}
];
const answers=normalizeAnswers(fields,{full_name:'測試會員',meal:'素食'});
test('atomic SQLite D1 registration stores validated answers and prevents overselling',()=>{
 assert.ok(Array.isArray(answers.values));
 const script=`
import sqlite3,json,sys
x=json.load(sys.stdin)
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
db.executescript(x['schema']);db.executescript(x['guard'])
db.execute("INSERT INTO members(id,external_subject) VALUES('m1','s1'),('m2','s2')")
db.execute("INSERT INTO events(id,title,category,status) VALUES('evt','實作測試','training','published')")
db.execute("INSERT INTO event_sessions(id,event_id,title,capacity) VALUES('s1','evt','session',1)")
for f in x['fields']:
 db.execute("INSERT INTO event_fields(id,event_id,field_key,label,field_type,required,options_json) VALUES (?,'evt',?,?,?,?,?)",
 (f['id'],f['field_key'],f['label'],f['field_type'],f['required'],f['options_json']))
db.commit()
with db:
 db.execute("INSERT INTO event_registrations(id,event_id,session_id,member_id) VALUES('r1','evt','s1','m1')")
 for f in x['answers']:
  db.execute("INSERT INTO event_registration_values(registration_id,field_id,value_text) VALUES(?,?,?)",('r1',f['id'],f['value']))
assert dict(db.execute("SELECT field_id,value_text FROM event_registration_values WHERE registration_id='r1' LIMIT 1").fetchone()) if False else True
assert db.execute("SELECT COUNT(*) FROM event_registration_values WHERE registration_id='r1'").fetchone()[0]==2
try:
 with db:
  db.execute("INSERT INTO event_registrations(id,event_id,session_id,member_id) VALUES('r2','evt','s1','m2')")
  db.execute("INSERT INTO event_registration_values(registration_id,field_id,value_text) VALUES('r2','f1','X')")
 raise AssertionError('Capacity guard was bypassed')
except sqlite3.IntegrityError:pass
assert db.execute("SELECT COUNT(*) FROM event_registrations").fetchone()[0]==1
assert db.execute("SELECT COUNT(*) FROM event_registration_values WHERE registration_id='r2'").fetchone()[0]==0
print('pass')
`;
 const run=spawnSync('python3',['-c',script],{input:JSON.stringify({schema,guard,fields,answers:answers.values}),encoding:'utf8'});
 assert.equal(run.status,0,run.stderr||run.stdout);
 assert.match(run.stdout,/pass/);
});
