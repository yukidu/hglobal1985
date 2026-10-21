// Public event sessions: published events only; no registrations or attendee data.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":status===200?"public, max-age=60, s-maxage=60":"no-store","x-content-type-options":"nosniff"}});
export async function onRequestGet({request,env}){
 const id=new URL(request.url).searchParams.get("event_id");
 if(!id||id.length>128||!/^[A-Za-z0-9_-]+$/.test(id))return json({error:"invalid_event_id"},400);
 if(!env.HGLOBAL_DB)return json({error:"database_unavailable"},503);
 try{
  const event=await env.HGLOBAL_DB.prepare("SELECT id, title, category, summary, registration_opens_at, registration_closes_at FROM events WHERE id = ? AND status = 'published' LIMIT 1").bind(id).first();
  if(!event)return json({error:"event_not_found"},404);
  const rows=await env.HGLOBAL_DB.prepare("SELECT id, title, starts_at, ends_at, venue_text, capacity, fee_amount, fee_currency FROM event_sessions WHERE event_id = ? ORDER BY sort_order ASC, starts_at ASC LIMIT 100").bind(id).all();
  return json({event,sessions:rows.results||[]});
 }catch{return json({error:"event_temporarily_unavailable"},503)}
}
