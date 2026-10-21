import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const schema = await readFile(new URL('../migrations/0001_initial_schema.sql', import.meta.url), 'utf8');
const guard = await readFile(new URL('../migrations/0003_venue_booking_overlap_guard.sql', import.meta.url), 'utf8');
const python = `
import sqlite3,sys,json
data=json.load(sys.stdin)
db=sqlite3.connect(':memory:')
db.executescript(data['schema'])
db.executescript(data['guard'])
db.execute("INSERT INTO venues(id,name) VALUES ('venue-a','Test venue')")
db.execute("INSERT INTO venues(id,name) VALUES ('venue-b','Other venue')")
db.execute("INSERT INTO venue_slots(id,venue_id,starts_at,ends_at) VALUES ('slot-a','venue-a','2026-10-25T10:00:00','2026-10-25T11:00:00')")
db.execute("INSERT INTO venue_bookings(id,venue_id,slot_id,status,starts_at,ends_at) VALUES ('booking1','venue-a','slot-a','pending','2026-10-25T10:00:00','2026-10-25T11:00:00')")
def denied(sql):
 try: db.execute(sql)
 except sqlite3.IntegrityError: return
 raise AssertionError('Conflict was not rejected: '+sql)
denied("INSERT INTO venue_bookings(id,venue_id,status,starts_at,ends_at) VALUES ('booking2','venue-a','approved','2026-10-25T10:30:00','2026-10-25T11:30:00')")
denied("INSERT INTO venue_bookings(id,venue_id,slot_id,status,starts_at,ends_at) VALUES ('booking2','venue-b','slot-a','approved','2026-10-25T10:00:00','2026-10-25T11:00:00')")
denied("INSERT INTO venue_bookings(id,venue_id,status,starts_at,ends_at) VALUES ('booking2','venue-a','approved','2026-10-25T11:00:00','2026-10-25T11:00:00')")
db.execute("INSERT INTO venue_bookings(id,venue_id,status,starts_at,ends_at) VALUES ('booking2','venue-a','pending','2026-10-25T11:00:00','2026-10-25T12:00:00')")
denied("UPDATE venue_bookings SET starts_at='2026-10-25T10:30:00' WHERE id='booking2'")
db.execute("UPDATE venue_bookings SET status='cancelled' WHERE id='booking1'")
db.execute("UPDATE venue_bookings SET starts_at='2026-10-25T10:30:00' WHERE id='booking2'")
denied("UPDATE venue_bookings SET status='approved',starts_at='2026-10-25T10:30:00' WHERE id='booking1'")
db.execute("INSERT INTO venue_bookings(id,venue_id,status,starts_at,ends_at) VALUES ('booking3','venue-b','pending','2026-10-25T10:30:00','2026-10-25T11:30:00')")
print('pass')
`;
test('SQLite D1-schema trigger prevents overlapping active bookings, including updates', () => {
  const run = spawnSync('python3', ['-c', python], { input: JSON.stringify({schema,guard}), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /pass/);
});
