import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {CANCEL_SQL as cancelEvent,onRequestDelete as cancelEventRoute} from '../functions/api/v1/event-registrations/[id].js';
import {CANCEL_SQL as cancelVenue,onRequestDelete as cancelVenueRoute} from '../functions/api/v1/venue-bookings/[id].js';

const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const [schema,eventsGuard,venuesGuard,notifications]=await Promise.all([
  read('../migrations/0001_initial_schema.sql'),
  read('../migrations/0004_registration_capacity_guard.sql'),
  read('../migrations/0003_venue_booking_overlap_guard.sql'),
  read('../migrations/0006_inapp_notifications.sql')
]);
const python=`
import json,sqlite3,sys
x=json.load(sys.stdin)
db=sqlite3.connect(':memory:')
db.row_factory=sqlite3.Row
db.execute('PRAGMA foreign_keys=ON')
for step in ['schema','event_guard','venue_guard','notifications']:db.executescript(x[step])
for who in ['m1','m2']:
 db.execute("INSERT INTO members(id,external_subject) VALUES (?,?)",(who,who+'-starry'))
db.execute("INSERT INTO events(id,title,category,status) VALUES('evt','測試課程','training','published')")
db.execute("INSERT INTO event_sessions(id,event_id,title,capacity) VALUES('s1','evt','早場',4)")
db.execute("INSERT INTO venues(id,name) VALUES('v1','台北場地')")
db.execute("INSERT INTO venue_slots(id,venue_id,starts_at,ends_at) VALUES('slot1','v1','2027-01-01T10:00:00','2027-01-01T11:00:00')")
db.execute("INSERT INTO event_registrations(id,event_id,session_id,member_id) VALUES('e1','evt','s1','m1')")
db.execute("INSERT INTO venue_bookings(id,venue_id,slot_id,member_id,starts_at,ends_at) VALUES('b1','v1','slot1','m1','2027-01-01T10:00:00','2027-01-01T11:00:00')")
assert db.execute("SELECT COUNT(*) FROM notifications WHERE member_id='m1'").fetchone()[0]==2
assert db.execute(x['cancel_event'],('e1','m2')).fetchone() is None
assert db.execute(x['cancel_venue'],('b1','m2')).fetchone() is None
assert db.execute(x['cancel_event'],('e1','m1'))['status']=='cancelled'
assert db.execute(x['cancel_venue'],('b1','m1'))['status']=='cancelled'
assert db.execute("SELECT COUNT(*) FROM notifications WHERE member_id='m1'").fetchone()[0]==4
assert db.execute("SELECT COUNT(*) FROM notifications WHERE member_id='m2'").fetchone()[0]==0
assert db.execute(x['cancel_event'],('e1','m1')).fetchone() is None
assert db.execute(x['cancel_venue'],('b1','m1')).fetchone() is None
assert db.execute("SELECT COUNT(*) FROM notifications WHERE member_id='m1'").fetchone()[0]==4
db.execute("INSERT INTO event_registrations(id,event_id,session_id,member_id,payment_status) VALUES('e2','evt','s1','m2','paid')")
assert db.execute(x['cancel_event'],('e2','m2')).fetchone() is None
db.execute("INSERT INTO venue_bookings(id,venue_id,slot_id,member_id,status,starts_at,ends_at) VALUES('b2','v1','slot1','m2','approved','2027-01-01T10:00:00','2027-01-01T11:00:00')")
assert db.execute(x['cancel_venue'],('b2','m2')).fetchone() is None
assert db.execute("SELECT status FROM venue_bookings WHERE id='b2'").fetchone()[0]=='approved'
assert db.execute("SELECT COUNT(*) FROM notifications WHERE member_id='m1' AND read_at IS NULL").fetchone()[0]==4
print('pass')
`;
test('event and venue cancellation enforce owner, protect payments, and create in-app notifications atomically',()=>{
 const run=spawnSync('python3',['-c',python],{input:JSON.stringify({
  schema,event_guard:eventsGuard,venue_guard:venuesGuard,notifications,
  cancel_event:cancelEvent,cancel_venue:cancelVenue
 }),encoding:'utf8'});
 assert.equal(run.status,0,run.stderr||run.stdout);
 assert.match(run.stdout,/pass/);
});
test('anonymous callers cannot cancel other people booking or registration',async()=>{
 const env={HGLOBAL_DB:{}};
 for(const [fn,path] of [[cancelEventRoute,'event-registrations'],[cancelVenueRoute,'venue-bookings']]){
   const r=await fn({env,request:new Request('https://preview.test/api/v1/'+path+'/abc',{method:'DELETE'}),params:{id:'abc'}});
   assert.equal(r.status,401);
 }
});
