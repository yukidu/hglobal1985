import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../functions/api/v1/venue-availability.js',import.meta.url),'utf8');
const {onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const req=(query,db)=>onRequestGet({request:new Request('https://example.test/api/v1/venue-availability'+query),env:db?{HGLOBAL_DB:db}:{}});
test('rejects invalid venue and date windows',async()=>{
 for(const q of ['','?venue_id=../bad&from=2026-10-21&to=2026-10-22','?venue_id=v1&from=2026-02-30&to=2026-03-01','?venue_id=v1&from=2026-10-21&to=2027-01-01','?venue_id=v1&from=2026-10-22&to=2026-10-21'])assert.equal((await req(q,{})).status,400);
});
test('requires D1 and active venue',async()=>{
 const q='?venue_id=v1&from=2026-10-21&to=2026-10-22';
 assert.equal((await req(q,null)).status,503);
 const db={prepare(){return{bind(){return{first:async()=>null}}}}};
 assert.equal((await req(q,db)).status,404);
});
test('only returns slots without pending or approved bookings',async()=>{
 const sql=[],params=[];
 const db={prepare(s){sql.push(s);return{bind(...p){params.push(p);return{first:async()=>({id:'v1',name:'會場',timezone:'Asia/Taipei'}),all:async()=>({results:[{id:'slot1'}]})}}}}};
 const r=await req('?venue_id=v1&from=2026-10-21&to=2026-10-22',db);
 assert.equal(r.status,200);assert.match(sql[1],/NOT EXISTS/);assert.match(sql[1],/pending','approved/);
 assert.match(sql[1],/b\.venue_id = venue_slots\.venue_id/);
 assert.match(sql[1],/b\.starts_at < venue_slots\.ends_at/);
 assert.match(sql[1],/b\.ends_at > venue_slots\.starts_at/);
 assert.doesNotMatch(sql[1],/contact_name|contact_phone|member_id/);
 assert.deepEqual(params[1],['v1','2026-10-21T00:00:00','2026-10-23T00:00:00']);
 assert.equal((await r.json()).slots[0].id,'slot1');
});
