import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const schema=await readFile(new URL('../migrations/0001_initial_schema.sql',import.meta.url),'utf8');
const guards=await readFile(new URL('../migrations/0004_registration_capacity_guard.sql',import.meta.url),'utf8');
const python=`
import sqlite3,json,sys
obj=json.load(sys.stdin)
db=sqlite3.connect(':memory:')
db.executescript(obj['schema'])
db.executescript(obj['guards'])
db.execute("INSERT INTO members(id,external_subject) VALUES('m1','sub1'),('m2','sub2'),('m3','sub3')")
db.execute("INSERT INTO events(id,title,category,status) VALUES('event1','test','training','published')")
db.execute("INSERT INTO events(id,title,category,status) VALUES('hidden','test','training','draft')")
db.execute("INSERT INTO event_sessions(id,event_id,title,capacity) VALUES('s1','event1','session',1)")
db.execute("INSERT INTO event_sessions(id,event_id,title,capacity) VALUES('s2','event1','session2',2)")
db.execute("INSERT INTO event_sessions(id,event_id,title,capacity) VALUES('hidden-s','hidden','session3',2)")
def denied(sql):
 try: db.execute(sql)
 except sqlite3.IntegrityError: return
 raise AssertionError('Expected constraint rejection: '+sql)
db.execute("INSERT INTO event_registrations(id,event_id,session_id,member_id) VALUES('r1','event1','s1','m1')")
denied("INSERT INTO event_registrations(id,event_id,session_id,member_id) VALUES('r2','event1','s1','m1')")
denied("INSERT INTO event_registrations(id,event_id,session_id,member_id) VALUES('r2','event1','s1','m2')")
denied("INSERT INTO event_registrations(id,event_id,session_id,member_id) VALUES('r2','event1','hidden-s','m2')")
denied("INSERT INTO event_registrations(id,event_id,session_id,member_id) VALUES('r2','hidden','hidden-s','m2')")
denied("INSERT INTO event_registrations(id,event_id,session_id) VALUES('r2','event1','s2')")
db.execute("UPDATE event_registrations SET status='cancelled' WHERE id='r1'")
db.execute("INSERT INTO event_registrations(id,event_id,session_id,member_id) VALUES('r2','event1','s1','m2')")
db.execute("INSERT INTO event_registrations(id,event_id,session_id,member_id) VALUES('r3','event1','s2','m1')")
denied("UPDATE event_registrations SET session_id='s1' WHERE id='r3'")
print('pass')
`;
test('D1 SQLite registration triggers prevent duplicates, overselling, cross-event sessions and unauthenticated registrations',()=>{
 const run=spawnSync('python3',['-c',python],{input:JSON.stringify({schema,guards}),encoding:'utf8'});
 assert.equal(run.status,0,run.stderr||run.stdout);
 assert.match(run.stdout,/pass/);
});
