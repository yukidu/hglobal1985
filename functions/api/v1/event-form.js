import {validEventId,publicField} from '../../_lib/event-form.js';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  'content-type':'application/json; charset=utf-8',
  'cache-control':status===200?'public, max-age=30, s-maxage=30':'no-store',
  'x-content-type-options':'nosniff'
}});
export async function onRequestGet({request,env}){
 const eventId=new URL(request.url).searchParams.get('event_id');
 if(!validEventId(eventId))return json({error:'invalid_event_id'},400);
 if(!env.HGLOBAL_DB)return json({error:'database_unavailable'},503);
 try{
  const event=await env.HGLOBAL_DB.prepare(
    "SELECT id,title,category,registration_opens_at,registration_closes_at FROM events WHERE id=? AND status='published' LIMIT 1"
  ).bind(eventId).first();
  if(!event)return json({error:'event_not_found'},404);
  const rows=await env.HGLOBAL_DB.prepare(
    "SELECT field_key,label,field_type,required,options_json FROM event_fields WHERE event_id=? ORDER BY sort_order ASC LIMIT 65"
  ).bind(eventId).all();
  if(!Array.isArray(rows?.results)||rows.results.length>64)return json({error:'event_form_unavailable'},503);
  const fields=rows.results.map(publicField);
  if(fields.some(x=>!x))return json({error:'event_form_unavailable'},503);
  return json({event,fields});
 } catch{return json({error:'event_form_unavailable'},503)}
}
