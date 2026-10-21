import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {
 SESSION_COOKIE,STATE_COOKIE,randomSecret,hashSecret,setSessionCookie,
 cookieValue,constantEqual,issueLocalSession
} from '../functions/_lib/hglobal-session.js';
import {onRequest as middleware} from '../functions/_middleware.js';
import {onRequestGet as begin} from '../functions/auth/start.js';
import {onRequestGet as callback} from '../functions/auth/callback.js';
import {currentMember} from '../functions/_lib/starry-auth.js';

const secret='hglobal-sso-test-only-shared-secret-0000001';
const c=globalThis.crypto??webcrypto;
test('secure host-only cookies and random anti-CSRF state',async()=>{
 const a=randomSecret(),b=randomSecret();
 assert.match(a,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(a,b);
 assert.equal((await hashSecret(a)).length,64);
 assert.match(setSessionCookie(a),/Secure; HttpOnly; SameSite=Lax; Path=\//);
 assert.doesNotMatch(setSessionCookie(a),/Domain=/);
 const req=new Request('https://hglobal1985.com/',{headers:{Cookie:SESSION_COOKIE+'='+a}});
 assert.equal(cookieValue(req,SESSION_COOKIE),a);
 assert.equal(constantEqual(a,a),true);
 assert.equal(constantEqual(a,b),false);
});
test('CSRF middleware blocks forged Origin and untrusted site for writes',async()=>{
 const next=async()=>new Response('allowed');
 for(const headers of [
   {'Origin':'https://attacker.test'},
   {'Origin':'null'},
   {'Sec-Fetch-Site':'cross-site'},
   {}
 ]) {
  const r=await middleware({request:new Request('https://hglobal1985.com/api/v1/event-registrations',{
   method:'POST',headers}),next});
  assert.equal(r.status,403);
 }
 const allowed=await middleware({request:new Request('https://hglobal1985.com/api/v1/event-registrations',{
  method:'POST',headers:{Origin:'https://hglobal1985.com'}}),next});
 assert.equal(allowed.status,200);
});
test('SSO login start redirects to central with host-bound anti-CSRF state',async()=>{
 const req=new Request('https://feat-test-environment-founda.hglobal-preview.pages.dev/auth/start');
 const res=await begin({request:req,env:{HGLOBAL_DB:{},HGLOBAL_SSO_EXCHANGE_SECRET:secret}});
 assert.equal(res.status,302);
 const dest=new URL(res.headers.get('location'));
 assert.equal(dest.host,'id.starry.phd');
 assert.equal(dest.pathname,'/auth/hglobal');
 assert.equal(dest.searchParams.get('preview'),'1');
 assert.match(dest.searchParams.get('state'),/^[A-Za-z0-9_-]{43}$/);
 assert.match(res.headers.get('set-cookie'),/HttpOnly/);
 assert.equal((await begin({request:req,env:{HGLOBAL_DB:{}}})).status,503);
});
test('HGlobal callback requires matching state before any central exchange',async()=>{
 const req=new Request('https://feat-test-environment-founda.hglobal-preview.pages.dev/auth/callback?code='+randomSecret()+'&state='+randomSecret());
 assert.equal((await callback({request:req,env:{HGLOBAL_DB:{},HGLOBAL_SSO_EXCHANGE_SECRET:secret}})).status,400);
});
test('HGlobal callback uses HMAC-authenticated server exchange and stores only own session hash',async()=>{
 const state=randomSecret(),code=randomSecret();
 const database={writes:[],prepare(sql){
  return{bind(...args){
   return{
    first:async()=>{
     if(sql.includes('INSERT INTO members'))return {id:'local-hglobal-member-1',status:'active'};
     return null;
    },
    run:async()=>({success:true}),
    sql,args
   };
  }};
 },async batch(entries){this.writes.push(...entries);return entries.map(()=>({success:true}))}};
 const original=globalThis.fetch;
 let verified=false;
 globalThis.fetch=async (url,options)=>{
  assert.equal(url,'https://id.starry.phd/api/apps/hglobal/exchange');
  const stamp=options.headers['X-HGlobal-Timestamp'];
  const signature=options.headers['X-HGlobal-Signature'];
  const key=await c.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signed=Uint8Array.from(signature.match(/../g),x=>parseInt(x,16));
  verified=await c.subtle.verify('HMAC',key,signed,
    new TextEncoder().encode('hglobal-v1\n'+stamp+'\n'+code));
  assert.equal(JSON.parse(options.body).code,code);
  return new Response(JSON.stringify({authenticated:true,subject:'starry-central-id',name:'寰宇會員',rank:'3%',avatar:''}),
    {headers:{'content-type':'application/json'}});
 };
 try {
  const response=await callback({request:new Request(
    'https://feat-test-environment-founda.hglobal-preview.pages.dev/auth/callback?code='+code+'&state='+state,
    {headers:{Cookie:STATE_COOKIE+'='+state}}),env:{HGLOBAL_DB:database,HGLOBAL_SSO_EXCHANGE_SECRET:secret}});
  assert.equal(response.status,303);
  assert.equal(response.headers.get('location'),'/account/');
  assert.equal(verified,true);
  assert.equal(database.writes.length,2);
  assert.match(database.writes[1].sql,/INSERT INTO hglobal_auth_sessions/);
  assert.doesNotMatch(JSON.stringify(database.writes),/starry-central-id|google_token|password/);
 }finally{globalThis.fetch=original}
});
test('HGlobal account resolution accepts only active independently issued local sessions',async()=>{
 const token=randomSecret(),req=new Request('https://hglobal1985.com/api/v1/members/me',{
  headers:{Cookie:SESSION_COOKIE+'='+token}});
 let queriedHash;
 const db={prepare(sql){return{bind(hash){queriedHash=hash;return{first:async()=>({
  id:'local-m1',display_name:'可登入會員',rank_label:'',status:'active',avatar_url:null
 })}}}}};
 const member=await currentMember(req,{HGLOBAL_DB:db});
 assert.equal(member.id,'local-m1');
 assert.equal(queriedHash,await hashSecret(token));
});
