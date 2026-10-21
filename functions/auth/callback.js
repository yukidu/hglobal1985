import {
  STATE_COOKIE,cookieValue,constantEqual,issueLocalSession,
  setSessionCookie,clearStateCookie
} from '../_lib/hglobal-session.js';

const PREVIEW_HOST='feat-test-environment-founda.hglobal-preview.pages.dev';
const HOSTS=new Set(['hglobal1985.com',PREVIEW_HOST]);
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const SUBJECT=/^[A-Za-z0-9:_-]{1,200}$/;
function hex(bytes){return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('')}
function response(message,status=400,redirect=null){
  const headers=new Headers({
    'cache-control':'no-store','referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff'
  });
  headers.set('Set-Cookie',clearStateCookie());
  if(redirect)headers.set('location',redirect);
  else headers.set('content-type','text/plain; charset=utf-8');
  return new Response(redirect?null:message,{status,headers});
}
function verifiedAvatar(input){
  if(typeof input!=='string'||input.length>512)return null;
  try {
    const url=new URL(input);
    return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;
  } catch{return null}
}
export async function onRequestGet({request,env}){
  const url=new URL(request.url);
  if(!HOSTS.has(url.hostname))return response('Untrusted origin',403);
  const code=url.searchParams.get('code'),state=url.searchParams.get('state');
  const expected=cookieValue(request,STATE_COOKIE);
  if(!TOKEN.test(code||'')||!TOKEN.test(state||'')||
     !expected||!constantEqual(state,expected)){
    return response('Invalid login state; please restart from /auth/start',400);
  }
  if(!env.HGLOBAL_DB||String(env.HGLOBAL_SSO_EXCHANGE_SECRET||'').length<32)
    return response('H-Global login is not configured',503);

  const timestamp=String(Date.now());
  const secret=String(env.HGLOBAL_SSO_EXCHANGE_SECRET);
  let result;
  try{
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
      {name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=hex(await crypto.subtle.sign('HMAC',key,
      new TextEncoder().encode('hglobal-v1\n'+timestamp+'\n'+code)));
    const upstream=await fetch('https://id.starry.phd/api/apps/hglobal/exchange',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-HGlobal-Timestamp':timestamp,
        'X-HGlobal-Signature':signature},
      body:JSON.stringify({code}),
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(7000)
    });
    if(!upstream.ok)return response('Starry ID exchange was rejected; restart login',upstream.status===401?401:503);
    result=await upstream.json();
  }catch{return response('Starry ID is temporarily unavailable',503)}
  if(result?.authenticated!==true||typeof result.subject!=='string'||!SUBJECT.test(result.subject))
    return response('Untrusted Starry ID response',503);
  const display=typeof result.name==='string'?result.name.slice(0,120):'寰宇會員';
  const rank=typeof result.rank==='string'?result.rank.slice(0,80):'';
  const avatar=verifiedAvatar(result.avatar);
  let member;
  try {
    member=await env.HGLOBAL_DB.prepare(`INSERT INTO members(
      id,identity_provider,external_subject,display_name,rank_label,avatar_url,status
    ) VALUES (?,'starry_id',?,?,?,?,'active')
    ON CONFLICT(external_subject) DO UPDATE SET
      display_name=excluded.display_name,
      rank_label=excluded.rank_label,
      avatar_url=excluded.avatar_url,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE members.status='active' AND members.identity_provider='starry_id'
    RETURNING id,status`)
      .bind(crypto.randomUUID(),result.subject,display,rank,avatar).first();
    if(!member||member.status!=='active')return response('H-Global member access is disabled',403);
    const session=await issueLocalSession(env.HGLOBAL_DB,member.id);
    const headers=new Headers({
      'location':'/account/','cache-control':'no-store','referrer-policy':'no-referrer'
    });
    headers.append('Set-Cookie',setSessionCookie(session.token));
    headers.append('Set-Cookie',clearStateCookie());
    return new Response(null,{status:303,headers});
  }catch{return response('Unable to create H-Global member session',503)}
}
