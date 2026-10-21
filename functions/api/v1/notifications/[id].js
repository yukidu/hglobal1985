// Mark one authenticated member's in-app notification as read.
import {currentMember,json,errorResponse} from '../../../_lib/starry-auth.js';
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
export const MARK_READ_SQL=`UPDATE notifications
  SET read_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id=? AND member_id=? AND read_at IS NULL RETURNING id,read_at`;
export async function onRequestPatch({request,env,params}) {
  try {
    const member=await currentMember(request,env);
    const id=String(params?.id??'');
    if(!validId(id))return json({error:'invalid_notification_id'},400);
    const changed=await env.HGLOBAL_DB.prepare(MARK_READ_SQL).bind(id,member.id).first();
    if(changed)return json({id:changed.id,read_at:changed.read_at});
    const existing=await env.HGLOBAL_DB.prepare(
      'SELECT id,read_at FROM notifications WHERE id=? AND member_id=? LIMIT 1'
    ).bind(id,member.id).first();
    if(!existing)return json({error:'notification_not_found'},404);
    return json({id:existing.id,read_at:existing.read_at});
  } catch(error){return errorResponse(error)}
}
