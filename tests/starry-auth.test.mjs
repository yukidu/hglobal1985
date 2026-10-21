import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {verifyStarryToken,currentMember,hasRole,AuthError} from '../functions/_lib/starry-auth.js';
import {onRequestGet} from '../functions/api/v1/members/me.js';

const cryptoApi=globalThis.crypto??webcrypto;
const environment={
  STARRY_ID_ISSUER:'https://id.starry.phd',
  STARRY_ID_AUDIENCE:'hglobal1985',
  STARRY_ID_JWKS_URL:'https://id.starry.phd/.well-known/jwks.json'
};
const issuer='https://id.starry.phd';
let keyPair,keyJwk;
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function setup() {
  if(keyPair) return;
  keyPair=await cryptoApi.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  keyJwk={...await cryptoApi.subtle.exportKey('jwk',keyPair.publicKey),kid:'test-key',alg:'RS256',use:'sig'};
}
const fetcher=async()=>new Response(JSON.stringify({keys:[keyJwk]}),{status:200,headers:{'content-type':'application/json'}});
async function token(claims={}) {
  await setup();
  const now=Math.floor(Date.now()/1000);
  const header=encode({alg:'RS256',kid:'test-key',typ:'JWT'});
  const payload=encode({iss:issuer,aud:'hglobal1985',sub:'google-sub-123',
    iat:now-10,nbf:now-10,exp:now+600,...claims});
  const bytes=new TextEncoder().encode(header+'.'+payload);
  const signature=await cryptoApi.subtle.sign('RSASSA-PKCS1-v1_5',keyPair.privateKey,bytes);
  return header+'.'+payload+'.'+Buffer.from(signature).toString('base64url');
}
test('valid signed Starry ID member identity accepted',async()=>{
  const subject=await verifyStarryToken(await token(),environment,{fetcher});
  assert.deepEqual(subject,{subject:'google-sub-123'});
});
test('fail closed for wrong audience, issuer, expiry, and forged roles',async()=>{
  for(const claim of [{aud:'untrusted'},{iss:'https://example.test'},{exp:1},{nbf:Math.floor(Date.now()/1000)+3600}]) {
    await assert.rejects(verifyStarryToken(await token(claim),environment,{fetcher}),AuthError);
  }
  // Replacing JWT payload without re-signing is rejected.
  const t=await token();
  const bits=t.split('.');
  bits[1]=encode({iss:issuer,aud:'hglobal1985',sub:'admin',exp:Math.floor(Date.now()/1000)+3600,roles:['super_admin']});
  await assert.rejects(verifyStarryToken(bits.join('.'),environment,{fetcher}),AuthError);
});
test('unconfigured Starry ID trust chain denies access',async()=>{
  await assert.rejects(verifyStarryToken(await token(),{}, {fetcher}),e=>e instanceof AuthError&&e.status===503);
});
test('identity maps by verified sub, not body role or client ID',async()=>{
  const input=await token({role:'super_admin',email:'fake@example.org'});
  let subject;
  const db={prepare(sql) {
    assert.match(sql,/identity_provider='starry_id'/);
    return {bind(id){subject=id;return{first:async()=>({id:'member-001',display_name:'測試會員',rank_label:'',avatar_url:null,status:'active'})}}};
  }};
  const request=new Request('https://hglobal-preview.pages.dev/api/v1/members/me',
    {headers:{Authorization:'Bearer '+input}});
  const member=await currentMember(request,{...environment,HGLOBAL_DB:db},{fetcher});
  assert.equal(member.id,'member-001');
  assert.equal(subject,'google-sub-123');
  assert.equal(member.role,undefined);
});
test('disabled, missing and anonymous members denied',async()=>{
  const request=new Request('https://example.test/api/v1/members/me');
  const r=await onRequestGet({request,env:{HGLOBAL_DB:{}}});
  assert.equal(r.status,401);
  assert.equal((await r.json()).error,'authentication_required');
  const signed=await token();
  const db={prepare(){return{bind(){return{first:async()=>({id:'m',status:'disabled'})}}}}};
  await assert.rejects(currentMember(new Request('https://example.test/',{headers:{Authorization:'Bearer '+signed}}),
      {...environment,HGLOBAL_DB:db},{fetcher}),e=>e.status===403);
});
test('authorization roles are sourced only from local membership rows',async()=>{
  const db={prepare(sql) {
    assert.match(sql,/WHERE member_id = \?/);
    return {bind(id){assert.equal(id,'m1');return{all:async()=>({results:[{role_code:'editor'}]})}}};
  }};
  assert.equal(await hasRole({HGLOBAL_DB:db},'m1',['editor']),true);
  assert.equal(await hasRole({HGLOBAL_DB:db},'m1',['super_admin']),false);
});
