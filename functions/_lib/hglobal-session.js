// H-Global-only opaque web sessions. Never use or copy Starry ID session cookies.
export const SESSION_COOKIE='__Host-hglobal_session';
export const STATE_COOKIE='__Host-hglobal_oauth_state';
export const SESSION_TTL_MS=60*60*1000;
function bytesToToken(bytes){
  let binary='';
  for(const value of bytes)binary+=String.fromCharCode(value);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
export function randomSecret(){
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToToken(bytes);
}
export async function hashSecret(token){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export function cookieValue(request,name){
  const header=request.headers.get('Cookie')||'';
  for(const entry of header.split(';')){
    const index=entry.indexOf('=');
    if(index<=0||entry.slice(0,index).trim()!==name)continue;
    const value=entry.slice(index+1).trim();
    if(/^[A-Za-z0-9_-]{43}$/.test(value))return value;
  }
  return null;
}
export function setSessionCookie(token){
  return SESSION_COOKIE+'='+token+'; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age='+Math.floor(SESSION_TTL_MS/1000);
}
export function clearSessionCookie(){
  return SESSION_COOKIE+'=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
}
export function setStateCookie(state){
  return STATE_COOKIE+'='+state+'; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=300';
}
export function clearStateCookie(){
  return STATE_COOKIE+'=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
}
export async function issueLocalSession(db,memberId){
  const token=randomSecret(),tokenHash=await hashSecret(token);
  const now=Date.now(),expires=now+SESSION_TTL_MS;
  await db.batch([
    db.prepare('DELETE FROM hglobal_auth_sessions WHERE expires_at<=?').bind(now),
    db.prepare('INSERT INTO hglobal_auth_sessions(token_hash,member_id,expires_at,created_at) VALUES (?,?,?,?)')
      .bind(tokenHash,memberId,expires,now)
  ]);
  return {token,expires};
}
export async function lookupLocalSession(request,db){
  const token=cookieValue(request,SESSION_COOKIE);
  if(!token)return null;
  const hash=await hashSecret(token);
  const row=await db.prepare(`SELECT m.id,m.display_name,m.rank_label,m.avatar_url,m.status
    FROM hglobal_auth_sessions s JOIN members m ON m.id=s.member_id
    WHERE s.token_hash=? AND s.expires_at>? LIMIT 1`).bind(hash,Date.now()).first();
  return row?.status==='active'?row:null;
}
export async function revokeLocalSession(request,db){
  const token=cookieValue(request,SESSION_COOKIE);
  if(!token)return false;
  await db.prepare('DELETE FROM hglobal_auth_sessions WHERE token_hash=?')
    .bind(await hashSecret(token)).run();
  return true;
}
export function constantEqual(left,right){
  if(typeof left!=='string'||typeof right!=='string'||left.length!==right.length)return false;
  let diff=0;
  for(let i=0;i<left.length;i++)diff|=left.charCodeAt(i)^right.charCodeAt(i);
  return diff===0;
}
