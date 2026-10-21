import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {onRequestGet,onRequestPost} from '../functions/api/v1/venue-bookings.js';
const c=globalThis.crypto??webcrypto;
const pair=await c.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
 publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await c.subtle.exportKey('jwk',pair.publicKey),kid:'venue-write-test',alg:'RS256',use:'sig'};
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
async function jwt(){
 const n=Math.floor(Date.now()/1000);
 const h=enc({alg:'RS256',kid:'venue-write-test'});
 const p=enc({iss:'https://id.starry.phd',aud:'hglobal1985',sub:'member-google-sub',iat:n-10,exp:n+600});
 const sig=await c.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(h+'.'+p));
 return h+'.'+p+'.'+Buffer.from(sig).toString('base64url');
}
const env={STARRY_ID_ISSUER:'https://id.starry.phd',STARRY_ID_AUDIENCE:'hglobal1985',
 STARRY_ID_JWKS_URL:'https://id.starry.phd/.well-known/jwks.json'};
function db({guard=true,slot=true,conflict=false}={}){
 const state={writes:[]};
 return {state,prepare(sql) {
  return {
    bind(...args) {return {
      first:async()=>{
        if(sql.includes('FROM members'))return {id:'local-m1',display_name:'原會員姓名',status:'active'};
        if(sql.includes('schema_migrations'))return guard?{version:'0003_venue_booking_overlap_guard'}:null;
        if(sql.includes('venue_slots s'))return slot?{
          id:'s1',venue_id:'v1',starts_at:'2099-10-21T12:00:00',ends_at:'2099-10-21T13:00:00',
          price_amount:500,currency:'TWD',timezone:'Asia/Taipei'}:null;
        return null;
      },
      all:async()=>({results:[]}),
      run:async()=>{state.writes.push({sql,args});if(conflict)throw Error('venue_time_conflict');return {success:true}}
    }};
  };
 }};
}
async function call(database,body) {
 const request=new Request('https://preview.test/api/v1/venue-bookings',{
  method:'POST',headers:{Authorization:'Bearer '+await jwt(),'Content-Type':'application/json'},
  body:JSON.stringify(body)});
 return onRequestPost({request,env:{...env,HGLOBAL_DB:database}});
}
test('public anonymous callers may not reserve a venue',async()=>{
 const response=await onRequestPost({request:new Request('https://preview.test/api/v1/venue-bookings',{method:'POST'}),env:{HGLOBAL_DB:{}}});
 assert.equal(response.status,401);
});
test('verified member cannot spoof booking identity, price, or approval',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}));
 try{
  const database=db();
  const response=await call(database,{slot_id:'s1',member_id:'attacker',price_amount:1,status:'approved',contact_phone:'0912 345 678'});
  assert.equal(response.status,201);
  assert.equal((await response.json()).total_amount,500);
  const write=database.state.writes[0];
  assert.match(write.sql,/'pending'/);
  assert.deepEqual(write.args.slice(1,4),['v1','s1','local-m1']);
  assert.equal(write.args[4],'原會員姓名');
  assert.equal(write.args[write.args.length-2],500);
 }finally{globalThis.fetch=old}
});
test('booking fails closed without installed D1 overlap guard',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}));
 try{const database=db({guard:false});const response=await call(database,{slot_id:'s1'});
  assert.equal(response.status,503);assert.equal(database.state.writes.length,0);
 }finally{globalThis.fetch=old}
});
test('occupied slots and malformed phones are not accepted',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}));
 try{
  assert.equal((await call(db({slot:false}),{slot_id:'s1'})).status,404);
  assert.equal((await call(db({conflict:true}),{slot_id:'s1'})).status,409);
  assert.equal((await call(db(),{slot_id:'s1',contact_phone:'<img>'})).status,400);
 }finally{globalThis.fetch=old}
});
