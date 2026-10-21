import { currentMember,rolesFor,json,errorResponse } from '../../../_lib/starry-auth.js';

// Member information belongs to the authenticated Starry ID subject.
// Client-provided member IDs, role flags and email are never trusted.
export async function onRequestGet({request,env}) {
  try {
    const member=await currentMember(request,env);
    const roles=await rolesFor(env,member.id);
    return json({member:{id:member.id,display_name:member.display_name,
      rank_label:member.rank_label,avatar_url:member.avatar_url},roles});
  } catch(error) { return errorResponse(error); }
}
