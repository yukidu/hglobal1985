import {revokeLocalSession,clearSessionCookie,clearStateCookie} from '../_lib/hglobal-session.js';
export async function onRequestPost({request,env}){
  let status=303;
  if(env.HGLOBAL_DB){
    try{await revokeLocalSession(request,env.HGLOBAL_DB)}
    catch{status=503}
  }else status=503;
  const headers=new Headers({
    location:'/', 'cache-control':'no-store','referrer-policy':'no-referrer'
  });
  headers.append('Set-Cookie',clearSessionCookie());
  headers.append('Set-Cookie',clearStateCookie());
  return new Response(null,{status,headers});
}
