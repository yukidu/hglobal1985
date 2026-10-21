import {currentMember,json,errorResponse,AuthError} from '../../_lib/starry-auth.js';
import {normalizeAnswers} from '../../_lib/event-form.js';

function validId(s){return typeof s==='string'&&s.length<=128&&/^[A-Za-z0-9_-]+$/.test(s)}
async function ensureGuard(db) {
  try {
    const row=await db.prepare("SELECT version FROM schema_migrations WHERE version='0004_registration_capacity_guard' LIMIT 1").first();
    if(!row) throw new AuthError('registration_safety_migration_missing',503);
  } catch(e) {if(e instanceof AuthError)throw e;throw new AuthError('database_unavailable',503);}
}
export async function onRequestGet({request,env}) {
  try {
    const member=await currentMember(request,env);
    const result=await env.HGLOBAL_DB.prepare(
      "SELECT r.id,r.event_id,r.session_id,r.status,r.payment_status,r.submitted_at,e.title AS event_title,s.title AS session_title,s.starts_at FROM event_registrations r JOIN events e ON e.id=r.event_id LEFT JOIN event_sessions s ON s.id=r.session_id WHERE r.member_id=? ORDER BY r.submitted_at DESC LIMIT 100"
    ).bind(member.id).all();
    return json({data:result.results||[]});
  } catch(e){return errorResponse(e)}
}
export async function onRequestPost({request,env}) {
  try {
    const member=await currentMember(request,env);
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))
      return json({error:'invalid_content_type'},415);
    const declared=Number(request.headers.get('content-length')||0);
    if(declared>48000) return json({error:'payload_too_large'},413);
    const raw=await request.text();
    if(raw.length>48000)return json({error:'payload_too_large'},413);
    let body;
    try{body=JSON.parse(raw)}catch{return json({error:'invalid_json'},400)}
    if(!body || typeof body!=='object' || Array.isArray(body) ||
       !validId(body.event_id) || !validId(body.session_id)) return json({error:'invalid_registration'},400);
    await ensureGuard(env.HGLOBAL_DB);
    const fieldRows=await env.HGLOBAL_DB.prepare(
      "SELECT id,field_key,label,field_type,required,options_json FROM event_fields WHERE event_id=? ORDER BY sort_order ASC LIMIT 65"
    ).bind(body.event_id).all();
    if(!fieldRows || !Array.isArray(fieldRows.results))throw new AuthError('database_unavailable',503);
    const answers=normalizeAnswers(fieldRows.results,body.answers ?? {});
    if(answers.error)return json({error:answers.error,field:answers.field},answers.error==='event_form_configuration_unavailable'?503:400);
    const id=crypto.randomUUID();
    const statement=env.HGLOBAL_DB.prepare(
      "INSERT INTO event_registrations(id,event_id,session_id,member_id,status,payment_status) VALUES (?,?,?,?,'submitted','unpaid')"
    ).bind(id,body.event_id,body.session_id,member.id);
    if(answers.values.length){
      // Atomic batch: the DB capacity trigger can reject registration,
      // rolling back both registration and all field values.
      const values=answers.values.map(field=>env.HGLOBAL_DB.prepare(
        "INSERT INTO event_registration_values(registration_id,field_id,value_text) VALUES (?,?,?)"
      ).bind(id,field.id,field.value));
      await env.HGLOBAL_DB.batch([statement,...values]);
    } else await statement.run();
    return json({id,event_id:body.event_id,session_id:body.session_id,status:'submitted'},201);
  } catch(e){
    const message=String(e?.message||'');
    if(/UNIQUE constraint failed: event_registrations\./i.test(message))
      return json({error:'already_registered'},409);
    if(/registration_session_full/i.test(message))return json({error:'session_full'},409);
    if(/registration_session_mismatch/i.test(message))return json({error:'invalid_session'},409);
    if(/event_not_open/i.test(message))return json({error:'registration_not_open'},409);
    if(/registration_identity_required/i.test(message))return json({error:'invalid_registration'},400);
    return errorResponse(e);
  }
}
