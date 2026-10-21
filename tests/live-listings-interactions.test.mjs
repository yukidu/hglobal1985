import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const ui=await readFile(new URL('../public/live-listings.js',import.meta.url),'utf8');
test('live event and venue detail readers are wired into listing cards',()=>{
  assert.match(ui,/function eventDetails\(/);
  assert.match(ui,/function venueDetails\(/);
  assert.match(ui,/\/api\/v1\/event-sessions\?event_id=/);
  assert.match(ui,/\/api\/v1\/venue-availability\?/);
  assert.match(ui,/new URLSearchParams\(/);
});
test('dynamic public API responses render through textContent rather than HTML injection',()=>{
  assert.match(ui,/title\.textContent = String\(session\.title/);
  assert.match(ui,/title\.textContent = \[slot\.starts_at/);
  assert.match(ui,/fee\.textContent/);
  assert.doesNotMatch(ui,/\.innerHTML\s*=/);
});
test('calendar validates at most one month and never writes a booking without auth',()=>{
  assert.match(ui,/31 \* 86400000/);
  assert.doesNotMatch(ui,/method:\s*['"]POST['"]/i);
});
