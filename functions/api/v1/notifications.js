// Authenticated in-app notification inbox; never expose other members' items.
import {currentMember,json,errorResponse} from '../../_lib/starry-auth.js';

export async function onRequestGet({request,env}) {
 try {
  const member=await currentMember(request,env);
  const params=new URL(request.url).searchParams;
  const limitRaw=params.get('limit')??'20', offsetRaw=params.get('offset')??'0';
  if(!/^[0-9]{1,2}$/.test(limitRaw)||!/^[0-9]{1,5}$/.test(offsetRaw))
    return json({error:'invalid_pagination'},400);
  const limit=Number(limitRaw),offset=Number(offsetRaw);
  if(limit<1||limit>50||offset>10000)return json({error:'invalid_pagination'},400);
  const rows=await env.HGLOBAL_DB.prepare(
   `SELECT id,category,title,body,target_url,read_at,created_at
    FROM notifications WHERE member_id=?
    ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`
  ).bind(member.id,limit,offset).all();
  const unread=await env.HGLOBAL_DB.prepare(
   'SELECT COUNT(*) AS count FROM notifications WHERE member_id=? AND read_at IS NULL'
  ).bind(member.id).first();
  return json({data:rows.results||[],unread_count:Number(unread?.count??0),pagination:{limit,offset}});
 } catch(error){return errorResponse(error)}
}
