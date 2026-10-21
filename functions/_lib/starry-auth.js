import {lookupLocalSession} from './hglobal-session.js';
// H-Global auth boundary. Starry ID is the sole external issuer; never trust
// browser-supplied user IDs, roles or emailed profile claims.
export class AuthError extends Error {
  constructor(code, status=401) { super(code); this.code=code; this.status=status; }
}
const decoder = new TextDecoder();
function base64url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new AuthError('invalid_token');
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'='));
  return Uint8Array.from(binary, x=>x.charCodeAt(0));
}
function parsePart(value) {
  try { return JSON.parse(decoder.decode(base64url(value))); }
  catch { throw new AuthError('invalid_token'); }
}
export function json(body,status=200) {
  return new Response(JSON.stringify(body),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'vary':'Authorization'
  }});
}
function bearer(request) {
  const raw=request.headers.get('Authorization')||'';
  const match=/^Bearer ([A-Za-z0-9._-]{20,8192})$/.exec(raw);
  if(!match) throw new AuthError('authentication_required');
  return match[1];
}
function config(env) {
  const issuer=String(env.STARRY_ID_ISSUER||'');
  const audience=String(env.STARRY_ID_AUDIENCE||'');
  const jwks=String(env.STARRY_ID_JWKS_URL||'');
  if(!issuer || !audience || !jwks) throw new AuthError('identity_provider_not_configured',503);
  let url, issuerUrl;
  try { url=new URL(jwks); issuerUrl=new URL(issuer); }
  catch { throw new AuthError('identity_provider_not_configured',503); }
  // Explicitly trust only the independently operated Starry ID origin.
  if(url.protocol!=='https:' || url.hostname!=='id.starry.phd' ||
     issuerUrl.protocol!=='https:' || issuerUrl.hostname!=='id.starry.phd' ||
     url.username || url.password || issuerUrl.username || issuerUrl.password ||
     url.port || issuerUrl.port || !audience || audience.length>128)
    throw new AuthError('identity_provider_not_configured',503);
  return {issuer,audience,jwks};
}
let cached=null;
async function keySet(url,fetcher) {
  const now=Date.now();
  if(cached?.url===url && cached.expires>now) return cached.keys;
  let res;
  try { res=await fetcher(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(5000),redirect:'error'}); }
  catch { throw new AuthError('identity_provider_unavailable',503); }
  if(!res.ok) throw new AuthError('identity_provider_unavailable',503);
  let data;
  try { data=await res.json(); }
  catch { throw new AuthError('identity_provider_unavailable',503); }
  if(!Array.isArray(data.keys) || data.keys.length>30) throw new AuthError('identity_provider_unavailable',503);
  cached={url,keys:data.keys,expires:now+60_000};
  return data.keys;
}
export async function verifyStarryToken(token,env,{fetcher=fetch,now=Date.now()}={}) {
  const cfg=config(env);
  if(token.length>8192 || token.split('.').length!==3) throw new AuthError('invalid_token');
  const [head,payload,signature]=token.split('.');
  const header=parsePart(head),claims=parsePart(payload);
  if(header.alg!=='RS256' || typeof header.kid!=='string' || header.kid.length>128 ||
     header.crit || header.jku || header.jwk || header.x5u ||
     !claims || typeof claims!=='object' || Array.isArray(claims))
    throw new AuthError('invalid_token');
  const keys=await keySet(cfg.jwks,fetcher);
  const jwk=keys.find(k=>k.kid===header.kid && k.kty==='RSA' &&
    (!k.alg || k.alg==='RS256') && (!k.use || k.use==='sig') &&
    (!k.key_ops || (Array.isArray(k.key_ops) && k.key_ops.includes('verify'))));
  if(!jwk || jwk.kty!=='RSA' || jwk.kid!==header.kid ||
     (jwk.key_ops && !jwk.key_ops.includes('verify')) ||
     (jwk.alg && jwk.alg!=='RS256') || (jwk.use && jwk.use!=='sig')) throw new AuthError('invalid_token');
  let valid=false;
  try {
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,base64url(signature),
      new TextEncoder().encode(head+'.'+payload));
  } catch { throw new AuthError('invalid_token'); }
  if(!valid) throw new AuthError('invalid_token');
  const sec=Math.floor(now/1000);
  if(claims.iss!==cfg.issuer ||
     !(claims.aud===cfg.audience || (Array.isArray(claims.aud)&&claims.aud.includes(cfg.audience))) ||
     typeof claims.sub!=='string' || !/^[A-Za-z0-9:_-]{1,200}$/.test(claims.sub) ||
     !Number.isInteger(claims.exp) || claims.exp<=sec ||
     claims.exp>sec+86400 || (claims.nbf!==undefined && (!Number.isInteger(claims.nbf)||claims.nbf>sec+30)) ||
     (claims.iat!==undefined && (!Number.isInteger(claims.iat)||claims.iat>sec+30)) ||
     (Array.isArray(claims.aud) && claims.aud.length>1 && claims.azp!==cfg.audience))
    throw new AuthError('invalid_token');
  return {subject:claims.sub};
}
export async function currentMember(request,env,options={}) {
  if(!env.HGLOBAL_DB) throw new AuthError('database_unavailable',503);
  if(!request.headers.has('Authorization')){
    let session;
    try {session=await lookupLocalSession(request,env.HGLOBAL_DB);}
    catch {throw new AuthError('database_unavailable',503);}
    if(!session)throw new AuthError('authentication_required');
    return {id:session.id,display_name:session.display_name,
      rank_label:session.rank_label,avatar_url:session.avatar_url};
  }
  const identity=await verifyStarryToken(bearer(request),env,options);
  let member;
  try {
    member=await env.HGLOBAL_DB.prepare(
      "SELECT id,display_name,rank_label,avatar_url,status FROM members WHERE identity_provider='starry_id' AND external_subject=? LIMIT 1"
    ).bind(identity.subject).first();
  } catch { throw new AuthError('database_unavailable',503); }
  if(!member || member.status!=='active') throw new AuthError('member_not_enabled',403);
  return {id:member.id,display_name:member.display_name,rank_label:member.rank_label,avatar_url:member.avatar_url};
}
export async function rolesFor(env,memberId) {
  try {
    const result=await env.HGLOBAL_DB.prepare(
      "SELECT role_code FROM member_roles WHERE member_id = ?"
    ).bind(memberId).all();
    return (result.results||[]).map(r=>r.role_code).filter(x=>typeof x==='string');
  } catch { throw new AuthError('database_unavailable',503); }
}
export async function hasRole(env,memberId,roles) {
  if(!Array.isArray(roles) || roles.length===0) return false;
  return (await rolesFor(env,memberId)).some(role=>roles.includes(role));
}
export function errorResponse(error) {
  if(error instanceof AuthError) return json({error:error.code},error.status);
  return json({error:'internal_error'},503);
}
