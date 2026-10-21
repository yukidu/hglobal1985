// H-Global CMS draft revision API. All changes stay in draft until a separate
// authenticated review/publish workflow is implemented and approved.
import {currentMember,hasRole,json,errorResponse} from '../../../../_lib/starry-auth.js';
import {draftInput,safeTextHtml} from '../../../../_lib/cms-draft.js';

const writers=['super_admin','global_secretary'];
const validId=id=>typeof id==='string'&&/^[0-9]{1,12}$/.test(id);

export function draftPatchStatements({id,memberId,input,expectedRevision,changeNote='',revisionId,auditId}) {
  const html=safeTextHtml(input.text);
  return [
    {
      sql:`INSERT INTO page_revisions
       (id,page_id,revision_no,title,content_html,changed_by,change_note)
       SELECT ?, p.id, ?, ?, ?, ?, ?
       FROM pages p
       WHERE p.public_id = ? AND p.status = 'draft' AND p.access_level = 'public'
       AND (SELECT COALESCE(MAX(r.revision_no),0) FROM page_revisions r WHERE r.page_id=p.id) = ?`,
      binds:[revisionId,expectedRevision+1,input.title,html,memberId,changeNote,id,expectedRevision]
    },
    {
      sql:`UPDATE pages SET title=?,menu_key=?,content_html=?,updated_by=?,
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE public_id=? AND status='draft' AND access_level='public'
       AND EXISTS (SELECT 1 FROM page_revisions r WHERE r.id=? AND r.page_id=pages.id)`,
      binds:[input.title,input.menu_key,html,memberId,id,revisionId]
    },
    {
      sql:`INSERT INTO audit_logs(id,actor_member_id,action,entity_type,entity_id,details_json)
        SELECT ?, ?, 'update_draft', 'page', p.id, ?
        FROM pages p JOIN page_revisions r ON r.page_id=p.id
        WHERE p.public_id=? AND p.status='draft' AND r.id=?`,
      binds:[auditId,memberId,JSON.stringify({public_id:id,revision:expectedRevision+1}),id,revisionId]
    }
  ];
}
async function authorized(request,env) {
  const member=await currentMember(request,env);
  if(!await hasRole(env,member.id,writers)) return {error:json({error:'forbidden'},403)};
  return {member};
}
export async function onRequestGet({request,env,params}) {
  try {
    const result=await authorized(request,env);
    if(result.error)return result.error;
    const publicId=String(params?.id??'');
    if(!validId(publicId))return json({error:'invalid_public_id'},400);
    const page=await env.HGLOBAL_DB.prepare(
      "SELECT id, public_id,title,menu_key,content_html,status,updated_at FROM pages WHERE public_id=? AND status='draft' LIMIT 1"
    ).bind(publicId).first();
    if(!page)return json({error:'draft_not_found'},404);
    const revisions=await env.HGLOBAL_DB.prepare(
      'SELECT revision_no,title,changed_by,change_note,created_at FROM page_revisions WHERE page_id=? ORDER BY revision_no DESC LIMIT 100'
    ).bind(page.id).all();
    return json({page,revisions:revisions.results||[]});
  }catch(error){return errorResponse(error)}
}
export async function onRequestPatch({request,env,params}) {
  try {
    const result=await authorized(request,env);
    if(result.error)return result.error;
    const publicId=String(params?.id??'');
    if(!validId(publicId))return json({error:'invalid_public_id'},400);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))
      return json({error:'invalid_content_type'},415);
    if(Number(request.headers.get('content-length')||0)>30000)return json({error:'payload_too_large'},413);
    const raw=await request.text();
    if(raw.length>30000)return json({error:'payload_too_large'},413);
    let body;
    try{body=JSON.parse(raw)}catch{return json({error:'invalid_json'},400)}
    const input=draftInput({...body,public_id:publicId});
    const expected=body?.expected_revision;
    if(!input || !Number.isInteger(expected)||expected<1||expected>10000000 ||
       (body.change_note!==undefined && (typeof body.change_note!=='string'||body.change_note.length>300)))
      return json({error:'invalid_draft_revision'},400);
    const entries=draftPatchStatements({
      id:publicId,memberId:result.member.id,input,expectedRevision:expected,
      changeNote:body.change_note||'',revisionId:crypto.randomUUID(),auditId:crypto.randomUUID()
    });
    const statements=entries.map(item=>env.HGLOBAL_DB.prepare(item.sql).bind(...item.binds));
    // Cloudflare D1 batch executes in one transaction. If a second editor
    // has already changed the revision, the INSERT is a no-op, and the UPDATE
    // and audit write cannot run because they depend on the new revision ID.
    const outputs=await env.HGLOBAL_DB.batch(statements);
    if(!Array.isArray(outputs)||outputs.length!==3) return json({error:'database_unavailable'},503);
    if(Number(outputs[0]?.meta?.changes||0)!==1)return json({error:'draft_revision_conflict'},409);
    if(Number(outputs[1]?.meta?.changes||0)!==1 || Number(outputs[2]?.meta?.changes||0)!==1)
      return json({error:'database_integrity_check_failed'},503);
    return json({public_id:publicId,status:'draft',revision_no:expected+1,published:false});
  } catch(error){return errorResponse(error)}
}
