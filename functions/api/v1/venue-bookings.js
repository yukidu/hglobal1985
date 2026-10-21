import {currentMember,json,errorResponse,AuthError} from '../../_lib/starry-auth.js';
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
function taipeiInstant(iso) {
  if(typeof iso!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/.test(iso))
    return NaN;
  return Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(iso)?iso:iso+'+08:00');
}
async function guardExists(db) {
  const row=await db.prepare(
    "SELECT version FROM schema_migrations WHERE version='0003_venue_booking_overlap_guard' LIMIT 1"
  ).first();
  if(!row)throw new AuthError('venue_booking_guard_missing',503);
}
export async function onRequestGet({request,env}) {
 try {
  const member=await currentMember(request,env);
  const results=await env.HGLOBAL_DB.prepare(
   "SELECT b.id,b.venue_id,b.slot_id,b.status,b.starts_at,b.ends_at,b.total_amount,b.currency,b.created_at,v.name AS venue_name FROM venue_bookings b JOIN venues v ON v.id=b.venue_id WHERE b.member_id=? ORDER BY b.created_at DESC LIMIT 100"
  ).bind(member.id).all();
  return json({data:results.results||[]});
 }catch(e){return errorResponse(e)}
}
export async function onRequestPost({request,env}) {
 try {
  const member=await currentMember(request,env);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))
    return json({error:'invalid_content_type'},415);
  if(Number(request.headers.get('content-length')||0)>4096)return json({error:'payload_too_large'},413);
  const text=await request.text();
  if(text.length>4096)return json({error:'payload_too_large'},413);
  let body;
  try{body=JSON.parse(text)}catch{return json({error:'invalid_json'},400)}
  if(!body || typeof body!=='object' || Array.isArray(body) || !validId(body.slot_id) ||
     (body.contact_phone!==undefined && (typeof body.contact_phone!=='string' ||
       !/^[+0-9()\- ]{0,25}$/.test(body.contact_phone))) ||
     (body.purpose!==undefined && (typeof body.purpose!=='string' || body.purpose.length>500)))
    return json({error:'invalid_booking_fields'},400);
  await guardExists(env.HGLOBAL_DB);
  const slot=await env.HGLOBAL_DB.prepare(
    "SELECT s.id,s.venue_id,s.starts_at,s.ends_at,s.price_amount,s.currency,v.timezone FROM venue_slots s JOIN venues v ON v.id=s.venue_id WHERE s.id=? AND s.status='available' AND v.status='active' LIMIT 1"
  ).bind(body.slot_id).first();
  if(!slot)return json({error:'slot_not_available'},404);
  // Only supported timezone for MVP is Asia/Taipei; never silently treat other
  // local venue clock times as UTC.
  if(slot.timezone!=='Asia/Taipei')return json({error:'timezone_not_supported'},409);
  if(!Number.isInteger(slot.price_amount) || slot.price_amount<0 ||
     typeof slot.currency!=='string' || !/^[A-Z]{3}$/.test(slot.currency))
    throw new AuthError('invalid_venue_price',503);
  const start=taipeiInstant(slot.starts_at),end=taipeiInstant(slot.ends_at);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<=Date.now()||end<=start)
    return json({error:'slot_not_available'},409);
  const id=crypto.randomUUID();
  await env.HGLOBAL_DB.prepare(
   "INSERT INTO venue_bookings(id,venue_id,slot_id,member_id,contact_name,contact_phone,purpose,status,starts_at,ends_at,total_amount,currency) VALUES (?,?,?,?,?,?,?,'pending',?,?,?,?)"
  ).bind(id,slot.venue_id,slot.id,member.id,member.display_name,
    body.contact_phone||'',body.purpose||'',slot.starts_at,slot.ends_at,
    slot.price_amount,slot.currency).run();
  return json({id,slot_id:slot.id,status:'pending',total_amount:slot.price_amount,currency:slot.currency},201);
 }catch(e){
  if(/venue_time_conflict/i.test(String(e?.message)))return json({error:'booking_conflict'},409);
  if(/slot_venue_mismatch|invalid_booking_interval/i.test(String(e?.message)))
    return json({error:'slot_not_available'},409);
  return errorResponse(e);
 }
}
