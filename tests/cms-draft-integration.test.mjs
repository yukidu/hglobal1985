import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {onRequestPost,onRequestGet} from '../functions/api/v1/admin/page-drafts.js';

const secure=globalThis.crypto??webcrypto;
const enc=data=>Buffer.from(JSON.stringify(data)).toString('base64url');
const pair=await secure.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
 publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await secure.subtle.exportKey('jwk',pair.publicKey),kid:'cms-test-key',alg:'RS256',use:'sig'};
async function jwt() {
 const now=Math.floor(Date.now()/1000),header=enc({alg:'RS256',kid:'cms-test-key'});
 const payload=enc({iss:'https://id.starry.phd',aud:'hglobal1985',sub:'subject-1',iat:now-10,exp:now+600});
 const sig=await secure.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(header+'.'+payload));
 return header+'.'+payload+'.'+Buffer.from(sig).toString('base64url');
}
const vars={STARRY_ID_ISSUER:'https://id.starry.phd',STARRY_ID_AUDIENCE:'hglobal1985',
 STARRY_ID_JWKS_URL:'https://id.starry.phd/.well-known/jwks.json'};
function db(role) {
 const state={writes:[]};
 return {state,prepare(sql){
   return {bind(...args){
     const query={sql,args};
     return {
       first:async()=>({id:'member-1',display_name:'管理員',rank_label:'',avatar_url:null,status:'active'}),
       all:async()=>({results:[{role_code:role}]}),
       query
     };
   }};
 },batch:async queries=>{state.writes.push(...queries.map(q=>q.query));return queries.map(()=>({success:true}));}};
}
const makeRequest=async(body)=>new Request('https://preview.test/api/v1/admin/page-drafts',{
 method:'POST',headers:{Authorization:'Bearer '+await jwt(),'Content-Type':'application/json'},
 body:JSON.stringify(body)
});
test('verified secretary/admin creates draft, revision and audit in one batch',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200});
 try {
  const database=db('super_admin');
  const res=await onRequestPost({request:await makeRequest({
    public_id:'008888',title:'租借說明',menu_key:'場地租借',text:'<script>alert(1)</script>'}),
    env:{...vars,HGLOBAL_DB:database}});
  assert.equal(res.status,201);
  const obj=await res.json();
  assert.equal(obj.status,'draft');assert.equal(obj.published,false);
  assert.equal(database.state.writes.length,3);
  assert.match(database.state.writes[0].sql,/INSERT INTO pages/);
  assert.match(database.state.writes[1].sql,/INSERT INTO page_revisions/);
  assert.match(database.state.writes[2].sql,/INSERT INTO audit_logs/);
  assert.match(database.state.writes[0].args[4],/&lt;script&gt;/);
  assert.doesNotMatch(database.state.writes[0].args[4],/<script>/);
 } finally {globalThis.fetch=previous}
});
test('ordinary member denied CMS write without database changes',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200});
 try{
  const database=db('editor');
  const res=await onRequestPost({request:await makeRequest({
    public_id:'008889',title:'new',menu_key:'最新消息',text:'hello'}),
    env:{...vars,HGLOBAL_DB:database}});
  assert.equal(res.status,403);
  assert.equal(database.state.writes.length,0);
 }finally{globalThis.fetch=previous}
});
