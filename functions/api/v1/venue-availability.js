// Public available venue slots. Booking identities and contact details are private.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":status===200?"public, max-age=30, s-maxage=30":"no-store","x-content-type-options":"nosniff"}});
export async function onRequestGet({request,env}){
 const params=new URL(request.url).searchParams;
 const venueId=params.get('venue_id');
 const from=params.get('from');
 const to=params.get('to');
 if(!venueId||venueId.length>128||!/^[A-Za-z0-9_-]+$/.test(venueId))return json({error:'invalid_venue_id'},400);
 if(!from||!to||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return json({error:'invalid_date_range'},400);
 const start=Date.parse(from+'T00:00:00Z'),end=Date.parse(to+'T00:00:00Z');
 if(!Number.isFinite(start)||!Number.isFinite(end)||new Date(start).toISOString().slice(0,10)!==from||new Date(end).toISOString().slice(0,10)!==to||end-start>31*86400000)return json({error:'invalid_date_range'},400);
 if(!env.HGLOBAL_DB)return json({error:'database_unavailable'},503);
 try{
  const venue=await env.HGLOBAL_DB.prepare("SELECT id, name, timezone FROM venues WHERE id = ? AND status = 'active' LIMIT 1").bind(venueId).first();
  if(!venue)return json({error:'venue_not_found'},404);
  const result=await env.HGLOBAL_DB.prepare("SELECT id, starts_at, ends_at, price_amount, currency FROM venue_slots WHERE venue_id = ? AND status = 'available' AND starts_at >= ? AND starts_at < ? AND NOT EXISTS (SELECT 1 FROM venue_bookings b WHERE b.venue_id = venue_slots.venue_id AND b.starts_at < venue_slots.ends_at AND b.ends_at > venue_slots.starts_at AND b.status IN ('pending','approved')) ORDER BY starts_at ASC LIMIT 250").bind(venueId,from+'T00:00:00',new Date(end+86400000).toISOString().slice(0,10)+'T00:00:00').all();
  return json({venue,slots:result.results||[]});
 }catch{return json({error:'venue_slots_temporarily_unavailable'},503)}
}
