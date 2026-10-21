import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../functions/api/v1/event-sessions.js',import.meta.url),'utf8');
const {onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const req=(q,db)=>onRequestGet({request:new Request('https://example.test/api/v1/event-sessions'+q),env:db?{HGLOBAL_DB:db}:{}});
test('invalid event ids rejected without database query',async()=>{
 for(const q of ['','?event_id=../secret','?event_id=a%20b'])assert.equal((await req(q,{})).status,400);
});
test('no database returns 503',async()=>assert.equal((await req('?event_id=evt1',null)).status,503));
test('published event and sessions are filtered, parameterized and public',async()=>{
 const sql=[],ids=[];
 const db={prepare(s){sql.push(s);return{bind(id){ids.push(id);return{first:async()=>({id:'evt1',title:'活動'}),all:async()=>({results:[{id:'session1',title:'上午'}]})}}}}};
 const r=await req('?event_id=evt1',db);
 assert.equal(r.status,200);assert.deepEqual(ids,['evt1','evt1']);
 assert.match(sql[0],/status = 'published'/);
 assert.doesNotMatch(sql.join(' '),/event_registrations|member_id|contact_phone/);
 assert.equal((await r.json()).sessions[0].id,'session1');
});
test('unpublished event indistinguishable from nonexistent',async()=>{
 const db={prepare(){return{bind(){return{first:async()=>null}}}}};
 assert.equal((await req('?event_id=hidden',db)).status,404);
});
test('SQL failures do not disclose errors',async()=>{
 const r=await req('?event_id=evt1',{prepare(){throw Error('secret SQL')}});
 assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret SQL/);
});
