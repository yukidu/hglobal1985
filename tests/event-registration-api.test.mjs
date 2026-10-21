import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {onRequestGet,onRequestPost} from '../functions/api/v1/event-registrations.js';
const c=globalThis.crypto??webcrypto;
const pair=await c.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
 publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await c.subtle.exportKey('jwk',pair.publicKey),kid:'registration-test-key',alg:'RS256',use:'sig'};
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
async function jwt() {
 const now=Math.floor(Date.now()/1000);
 const h=enc({alg:'RS256',kid:'registration-test-key'});
 const p=enc({iss:'https://id.starry.phd',aud:'hglobal1985',sub:'registered-user-1',iat:now-5,exp:now+600});
 const sig=await c.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(h+'.'+p));
 return h+'.'+p+'.'+Buffer.from(sig).toString('base64url');
}
const vars={STARRY_ID_ISSUER:'https://id.starry.phd',STARRY_ID_AUDIENCE:'hglobal1985',
 STARRY_ID_JWKS_URL:'https://id.starry.phd/.well-known/jwks.json'};
function fakeDb({migration=true,required=0,insertError=null}={}) {
 const state={writes:[],query:[]};
 return {state,prepare(sql) {
   state.query.push(sql);
   return {
     bind(...args){
       return {
         first:async()=>sql.includes('FROM members')?
           {id:'hglobal-member-1',status:'active',display_name:'會員'}:
           sql.includes('schema_migrations')?(migration?{version:'0004_registration_capacity_guard'}:null):
           sql.includes('event_fields')?{count:required}:null,
         all:async()=>({results:[]}),
         run:async()=>{state.writes.push({sql,args});if(insertError)throw Error(insertError);return {success:true}}
       };
     },
     first:async()=>migration?{version:'0004_registration_capacity_guard'}:null
   };
 }};
}
async function call(db,body,method='POST') {
 const signed=await jwt();
 const request=new Request('https://preview.test/api/v1/event-registrations',{
   method,headers:{'content-type':'application/json',Authorization:'Bearer '+signed},
   ...(method==='POST'?{body:JSON.stringify(body)}:{})
 });
 return (method==='POST'?onRequestPost:onRequestGet)({request,env:{...vars,HGLOBAL_DB:db}});
}
test('anonymous registration is blocked',async()=>{
 const res=await onRequestPost({request:new Request('https://preview.test/',{method:'POST'}),env:{HGLOBAL_DB:{}}});
 assert.equal(res.status,401);
});
test('verified member registration derives member_id from D1 and inserts only allowed fields',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}));
 try {
   const db=fakeDb();
   const res=await call(db,{event_id:'e1',session_id:'s1',member_id:'attacker',payment_status:'paid',status:'confirmed'});
   assert.equal(res.status,201);
   assert.equal(db.state.writes.length,1);
   assert.deepEqual(db.state.writes[0].args.slice(1),['e1','s1','hglobal-member-1']);
   assert.match(db.state.writes[0].sql,/'submitted','unpaid'/);
 }finally{globalThis.fetch=old}
});
test('registration must fail closed until D1 conflict guards exist',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}));
 try {
   const db=fakeDb({migration:false});
   assert.equal((await call(db,{event_id:'e1',session_id:'s1'})).status,503);
   assert.equal(db.state.writes.length,0);
 }finally{globalThis.fetch=old}
});
test('required dynamic registration fields prevent accidental incomplete acceptance',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}));
 try {
   const db=fakeDb({required:2});
   const res=await call(db,{event_id:'e1',session_id:'s1'});
   assert.equal(res.status,409);
   assert.equal((await res.json()).error,'registration_form_not_ready');
   assert.equal(db.state.writes.length,0);
 }finally{globalThis.fetch=old}
});
