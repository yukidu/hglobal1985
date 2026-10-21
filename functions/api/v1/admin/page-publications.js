// H-Global text-only CMS publication review API.
// Phase 1: independent reviewers are mandatory; no legacy WordPress source
// HTML can be published through this endpoint.
import {currentMember,hasRole,json,errorResponse} from '../../../_lib/starry-auth.js';

const writers=['super_admin','global_secretary'];
const validPublicId=id=>typeof id==='string'&&/^[0-9]{1,12}$/.test(id);
const validRequestId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);

export const SUBMIT_SQL=`INSERT INTO cms_publication_requests
  (id,page_id,revision_no,requested_by,status)
  SELECT ?,p.id,?,?,'pending' FROM pages p
  WHERE p.public_id=? AND p.status='draft' AND p.access_level='public'
    AND p.source_wp_id IS NULL AND COALESCE(p.source_snapshot,'')=''
    AND EXISTS (SELECT 1 FROM page_revisions r WHERE r.page_id=p.id
      AND r.revision_no=? AND r.title=p.title AND r.content_html=p.content_html)
    AND (SELECT MAX(r2.revision_no) FROM page_revisions r2 WHERE r2.page_id=p.id)=?
  RETURNING id,page_id,revision_no,status`;
export const APPROVE_SQL=`UPDATE cms_publication_requests
  SET status='approved',reviewer_id=?,reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id=? AND status='pending' AND requested_by<>?
  AND EXISTS (
    SELECT 1 FROM pages p JOIN page_revisions r ON r.page_id=p.id
    WHERE p.id=cms_publication_requests.page_id
      AND p.status='draft' AND p.access_level='public'
      AND p.source_wp_id IS NULL AND COALESCE(p.source_snapshot,'')=''
      AND r.revision_no=cms_publication_requests.revision_no
      AND r.title=p.title AND r.content_html=p.content_html
      AND r.revision_no=(SELECT MAX(r2.revision_no) FROM page_revisions r2 WHERE r2.page_id=p.id)
  ) RETURNING id,page_id,revision_no`;
export const PUBLISH_SQL=`UPDATE pages SET status='published',updated_by=?,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE status='draft' AND id IN
    (SELECT page_id FROM cms_publication_requests
     WHERE id=? AND status='approved' AND reviewer_id=?)
  RETURNING id,public_id,status`;
export const PUBLISH_AUDIT_SQL=`INSERT INTO audit_logs
  (id,actor_member_id,action,entity_type,entity_id,details_json)
  SELECT ?,?,'publish_page','page',p.id,?
  FROM pages p JOIN cms_publication_requests q ON q.page_id=p.id
  WHERE q.id=? AND q.status='approved' AND q.reviewer_id=?
    AND p.status='published'
  RETURNING id`;
export const REJECT_SQL=`UPDATE cms_publication_requests SET
  status='rejected',reviewer_id=?,review_note=?,
  reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id=? AND status='pending' AND requested_by<>?
  RETURNING id,page_id,status`;
export const REJECT_AUDIT_SQL=`INSERT INTO audit_logs
  (id,actor_member_id,action,entity_type,entity_id,details_json)
  SELECT ?,?,'reject_page_publication','page',p.id,?
  FROM pages p JOIN cms_publication_requests q ON q.page_id=p.id
  WHERE q.id=? AND q.status='rejected' AND q.reviewer_id=?
  RETURNING id`;

async function authorize(request,env) {
  const member=await currentMember(request,env);
  if(!await hasRole(env,member.id,writers))return {response:json({error:'forbidden'},403)};
  return {member};
}
async function verifyMigration(db) {
  const row=await db.prepare(
    "SELECT version FROM schema_migrations WHERE version='0005_cms_publication_review' LIMIT 1"
  ).first();
  return Boolean(row);
}
export async function onRequestGet({request,env}) {
  try {
    const {member,response}=await authorize(request,env);
    if(response)return response;
    const status=new URL(request.url).searchParams.get('status')??'pending';
    if(!['pending','approved','rejected'].includes(status))
      return json({error:'invalid_review_status'},400);
    const rows=await env.HGLOBAL_DB.prepare(
      `SELECT q.id,q.revision_no,q.requested_by,q.status,q.requested_at,
         q.reviewer_id,q.reviewed_at,p.public_id,p.title,p.menu_key
       FROM cms_publication_requests q JOIN pages p ON p.id=q.page_id
       WHERE q.status=? ORDER BY q.requested_at DESC LIMIT 100`
    ).bind(status).all();
    return json({data:rows.results||[]});
  }catch(error){return errorResponse(error)}
}
export async function onRequestPost({request,env}) {
  try {
    const {member,response}=await authorize(request,env);
    if(response)return response;
    if(!await verifyMigration(env.HGLOBAL_DB))return json({error:'review_safety_migration_missing'},503);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))
      return json({error:'invalid_content_type'},415);
    if(Number(request.headers.get('content-length')||0)>4096)return json({error:'payload_too_large'},413);
    const text=await request.text();
    if(text.length>4096)return json({error:'payload_too_large'},413);
    let body;
    try {body=JSON.parse(text);}catch{return json({error:'invalid_json'},400)}
    if(!body || typeof body!=='object'||Array.isArray(body))
      return json({error:'invalid_review_request'},400);
    if(body.action==='submit'){
      if(!validPublicId(body.public_id)||!Number.isInteger(body.revision_no)||
         body.revision_no<1||body.revision_no>10000000)
        return json({error:'invalid_review_request'},400);
      const review=await env.HGLOBAL_DB.prepare(SUBMIT_SQL)
        .bind(crypto.randomUUID(),body.revision_no,member.id,body.public_id,body.revision_no,body.revision_no)
        .first();
      if(!review)return json({error:'draft_not_reviewable_or_stale'},409);
      return json({review},201);
    }
    if(body.action==='approve'||body.action==='reject'){
      const id=body.request_id;
      if(!validRequestId(id)||(
        body.action==='reject'&&body.review_note!==undefined&&
          (typeof body.review_note!=='string'||body.review_note.length>300)))
        return json({error:'invalid_review_request'},400);
      const auditId=crypto.randomUUID();
      const audit=JSON.stringify({review_request_id:id});
      const parts=body.action==='approve'?[
        [APPROVE_SQL,[member.id,id,member.id]],
        [PUBLISH_SQL,[member.id,id,member.id]],
        [PUBLISH_AUDIT_SQL,[auditId,member.id,audit,id,member.id]]
      ]:[
        [REJECT_SQL,[member.id,body.review_note||'',id,member.id]],
        [REJECT_AUDIT_SQL,[auditId,member.id,audit,id,member.id]]
      ];
      const queries=parts.map(([sql,params])=>env.HGLOBAL_DB.prepare(sql).bind(...params));
      const outcomes=await env.HGLOBAL_DB.batch(queries);
      if(!Array.isArray(outcomes)||outcomes.length!==parts.length)
        return json({error:'database_unavailable'},503);
      // A failed CAS changes zero rows, and every subsequent dependent statement
      // also changes zero rows. Since D1 batch is one transaction, success means
      // review, publish/reject, and audit all committed.
      if(outcomes.some(x=>Number(x?.meta?.changes||0)!==1))
        return json({error:'review_conflict_or_separate_reviewer_required'},409);
      return json({request_id:id,status:body.action==='approve'?'published':'rejected'});
    }
    return json({error:'invalid_review_action'},400);
  }catch(error){
    if(/UNIQUE constraint failed: cms_publication_requests\./i.test(String(error?.message)))
      return json({error:'publication_review_already_pending'},409);
    return errorResponse(error);
  }
}
