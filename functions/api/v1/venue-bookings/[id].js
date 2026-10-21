import {currentMember,json,errorResponse} from '../../../_lib/starry-auth.js';
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);

// Only pending requests can be cancelled automatically.
// Staff-approved bookings require manual review so a venue manager can
// coordinate refund/room preparation and capacity release.
export const CANCEL_SQL=`UPDATE venue_bookings SET status='cancelled',
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id=? AND member_id=? AND status='pending'
  RETURNING id,venue_id,slot_id,status`;

export async function onRequestDelete({request,env,params}){
 try{
  const member=await currentMember(request,env);
  const id=String(params?.id??'');
  if(!validId(id))return json({error:'invalid_booking_id'},400);
  const cancelled=await env.HGLOBAL_DB.prepare(CANCEL_SQL).bind(id,member.id).first();
  if(cancelled)return json({booking:cancelled});
  const existing=await env.HGLOBAL_DB.prepare(
    'SELECT id,status FROM venue_bookings WHERE id=? AND member_id=? LIMIT 1'
  ).bind(id,member.id).first();
  if(!existing)return json({error:'booking_not_found'},404);
  if(existing.status==='cancelled')return json({booking:{id,status:'cancelled'}});
  return json({error:'booking_cancellation_requires_staff_review'},409);
 }catch(error){return errorResponse(error)}
}
