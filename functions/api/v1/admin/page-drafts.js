import {currentMember,hasRole,json,errorResponse} from '../../../_lib/starry-auth.js';
import {draftInput,safeTextHtml} from '../../../_lib/cms-draft.js';

const writers=['super_admin','global_secretary'];
export async function onRequestGet({request,env}) {
  try {
    const member=await currentMember(request,env);
    if(!await hasRole(env,member.id,writers)) return json({error:'forbidden'},403);
    const result=await env.HGLOBAL_DB.prepare(
      "SELECT public_id,title,menu_key,status,updated_at FROM pages ORDER BY updated_at DESC LIMIT 100"
    ).all();
    return json({data:result.results||[]});
  } catch(error) { return errorResponse(error); }
}
export async function onRequestPost({request,env}) {
  try {
    const member=await currentMember(request,env);
    if(!await hasRole(env,member.id,writers)) return json({error:'forbidden'},403);
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||'')) return json({error:'invalid_content_type'},415);
    const text=await request.text();
    if(text.length>30000) return json({error:'payload_too_large'},413);
    let body;
    try {body=JSON.parse(text);} catch{return json({error:'invalid_json'},400);}
    const input=draftInput(body);
    if(!input) return json({error:'invalid_page_fields'},400);
    const id=crypto.randomUUID(), revisionId=crypto.randomUUID(), auditId=crypto.randomUUID();
    const html=safeTextHtml(input.text);
    // D1 batch is a transactional boundary: draft/revision/audit all commit, or none do.
    await env.HGLOBAL_DB.batch([
      env.HGLOBAL_DB.prepare(
        "INSERT INTO pages(id,public_id,title,menu_key,content_html,status,access_level,created_by,updated_by) VALUES (?,?,?,?,?,'draft','public',?,?)"
      ).bind(id,input.public_id,input.title,input.menu_key,html,member.id,member.id),
      env.HGLOBAL_DB.prepare(
        'INSERT INTO page_revisions(id,page_id,revision_no,title,content_html,changed_by,change_note) VALUES (?,?,1,?,?,?,?)'
      ).bind(revisionId,id,input.title,html,member.id,'Draft created'),
      env.HGLOBAL_DB.prepare(
        'INSERT INTO audit_logs(id,actor_member_id,action,entity_type,entity_id,details_json) VALUES (?,?,?,?,?,?)'
      ).bind(auditId,member.id,'create_draft','page',id,JSON.stringify({public_id:input.public_id}))
    ]);
    return json({id,public_id:input.public_id,status:'draft',published:false},201);
  } catch(error) {
    if(error?.message && /UNIQUE constraint failed: pages\.public_id/i.test(error.message))
      return json({error:'public_id_already_used'},409);
    return errorResponse(error);
  }
}
