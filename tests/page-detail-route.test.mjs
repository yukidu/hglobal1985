import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../functions/api/v1/pages/[id].js',import.meta.url),'utf8');
const {onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const req=(id,db)=>onRequestGet({params:{id},env:db?{HGLOBAL_DB:db}:{}});
test('detail route rejects malformed ids',async()=>{assert.equal((await req('../secret',{})).status,400);assert.equal((await req('123',null)).status,503)});
test('detail route projects published public fields only',async()=>{
 let sql='',id;
 const db={prepare(s){sql=s;return{bind(x){id=x;return{first:async()=>({public_id:'00123',title:'公開',content_html:'<p>內容</p>'})}}}}};
 const res=await req('00123',db);
 assert.equal(res.status,200);assert.equal(id,'00123');
 assert.match(sql,/status = 'published' AND access_level = 'public'/);
 assert.doesNotMatch(sql,/source_snapshot|source_wp_id|source_title|created_by|updated_by/);
 assert.equal((await res.json()).data.title,'公開');
});
test('detail route hides private records and SQL errors',async()=>{
 const missing={prepare(){return{bind(){return{first:async()=>null}}}}};
 assert.equal((await req('42',missing)).status,404);
 const broken={prepare(){throw Error('private SQL')}};
 const res=await req('42',broken);
 assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/private SQL/);
});
