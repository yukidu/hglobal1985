import {currentMember,json,errorResponse} from '../../../_lib/starry-auth.js';
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);

// Cancel only unpaid (or payment-not-required) active registrations.
// Already-paid registrations require a human refund decision.
export const CANCEL_SQL=`UPDATE event_registrations
  SET status='cancelled',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id=? AND member_id=? AND status IN ('submitted','confirmed','waitlisted')
    AND payment_status IN ('unpaid','not_required')
  RETURNING id,event_id,session_id,status`;
export async function onRequestDelete({request,env,params}){
  try{
    const member=await currentMember(request,env);
    const id=String(params?.id??'');
    if(!validId(id))return json({error:'invalid_registration_id'},400);
    const updated=await env.HGLOBAL_DB.prepare(CANCEL_SQL).bind(id,member.id).first();
    if(updated)return json({registration:updated});
    const old=await env.HGLOBAL_DB.prepare(
      'SELECT id,status,payment_status FROM event_registrations WHERE id=? AND member_id=? LIMIT 1'
    ).bind(id,member.id).first();
    if(!old)return json({error:'registration_not_found'},404);
    if(old.status==='cancelled')return json({registration:{id,status:'cancelled'}});
    return json({error:'cancellation_requires_staff_review'},409);
  }catch(error){return errorResponse(error)}
}
