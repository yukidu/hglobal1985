// H-Global subscription management. Phase 1 only enables in-app delivery.
// PWA push and email remain disabled until explicit opt-in and delivery workers.
import {currentMember,json,errorResponse} from '../../_lib/starry-auth.js';

export async function onRequestGet({request,env}) {
  try {
    const member=await currentMember(request,env);
    const result=await env.HGLOBAL_DB.prepare(
      `SELECT s.page_id,p.public_id,p.title,s.enabled,s.channel_in_app,s.channel_push,s.channel_email,s.updated_at
       FROM subscriptions s JOIN pages p ON p.id=s.page_id
       WHERE s.member_id=? ORDER BY s.updated_at DESC LIMIT 100`
    ).bind(member.id).all();
    return json({data:result.results||[]});
  } catch(error){return errorResponse(error)}
}
