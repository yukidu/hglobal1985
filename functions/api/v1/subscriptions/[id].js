import {currentMember,json,errorResponse} from '../../../_lib/starry-auth.js';

const validPublicId=id=>typeof id==='string' && /^[0-9]{1,12}$/.test(id);
export const SUBSCRIBE_SQL=`INSERT INTO subscriptions(
  member_id,page_id,channel_in_app,channel_push,channel_email,enabled)
  SELECT ?,p.id,1,0,0,1 FROM pages p
  WHERE p.public_id=? AND p.status='published' AND p.access_level='public'
    AND p.subscribable=1
  ON CONFLICT(member_id,page_id) DO UPDATE SET
    enabled=1,channel_in_app=1,channel_push=0,channel_email=0,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  RETURNING page_id,enabled,channel_in_app,channel_push,channel_email`;
export const UNSUBSCRIBE_SQL=`UPDATE subscriptions SET enabled=0,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE member_id=? AND page_id IN (SELECT id FROM pages WHERE public_id=?)
  RETURNING page_id,enabled`;

export async function onRequestPut({request,env,params}) {
  try {
    const member=await currentMember(request,env);
    const id=String(params?.id??'');
    if(!validPublicId(id))return json({error:'invalid_public_id'},400);
    const result=await env.HGLOBAL_DB.prepare(SUBSCRIBE_SQL).bind(member.id,id).first();
    if(!result)return json({error:'page_not_subscribable'},404);
    return json({subscription:result,delivery_channels:['in_app']});
  }catch(error){return errorResponse(error)}
}
export async function onRequestDelete({request,env,params}) {
  try {
    const member=await currentMember(request,env);
    const id=String(params?.id??'');
    if(!validPublicId(id))return json({error:'invalid_public_id'},400);
    const result=await env.HGLOBAL_DB.prepare(UNSUBSCRIBE_SQL).bind(member.id,id).first();
    // Repeated unsubscribe is safe; it never creates subscriptions.
    return json({public_id:id,enabled:false,changed:Boolean(result)});
  }catch(error){return errorResponse(error)}
}
