import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
test('member center uses authenticated same-origin API for actual operations',async()=>{
 const [html,js]=await Promise.all([read('../public/account/index.html'),read('../public/account/account.js')]);
 assert.match(html,/會員與管理控制台/);
 assert.match(html,/href="\/auth\/start"/);
 for(const path of [
  '/api/v1/members/me','/api/v1/event-registrations',
  '/api/v1/venue-bookings','/api/v1/subscriptions',
  '/api/v1/notifications','/api/v1/admin/page-drafts',
  '/api/v1/admin/page-publications','/api/v1/event-form',
  '/api/v1/event-sessions','/api/v1/venue-availability'
 ])assert.ok(js.includes(path),'missing '+path);
 for(const method of ["'DELETE'","'POST'","'PATCH'","'PUT'"])assert.ok(js.includes(method));
 assert.match(js,/credentials:'same-origin'/);
 assert.match(js,/cache:'no-store'/);
 assert.doesNotMatch(js,/\.innerHTML\s*=|localStorage\.|sessionStorage\.|document\.cookie/);
});
test('member center guards admin actions by local roles and double-review API',async()=>{
 const js=await read('../public/account/account.js');
 assert.match(js,/global_secretary/);
 assert.match(js,/super_admin/);
 assert.match(js,/action:'submit'/);
 assert.match(js,/action:'approve'/);
 assert.match(js,/action:'reject'/);
 assert.match(js,/expected_revision:latest\.revision_no/);
 assert.match(js,/registration\.id|r\.id/);
});
