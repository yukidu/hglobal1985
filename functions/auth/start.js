import {randomSecret,setStateCookie} from '../_lib/hglobal-session.js';

const PREVIEW_HOST='feat-test-environment-founda.hglobal-preview.pages.dev';
const allowedHosts=new Set(['hglobal1985.com','www.hglobal1985.com',PREVIEW_HOST]);
export async function onRequestGet({request,env}){
  const host=new URL(request.url).hostname.toLowerCase();
  if(host.endsWith('.hglobal-preview.pages.dev') && host!==PREVIEW_HOST){
    return new Response(null,{status:302,headers:{
      location:'https://'+PREVIEW_HOST+'/auth/start',
      'cache-control':'no-store','referrer-policy':'no-referrer'
    }});
  }
  if(host==='www.hglobal1985.com')return new Response(null,{status:302,headers:{
    location:'https://hglobal1985.com/auth/start',
    'cache-control':'no-store','referrer-policy':'no-referrer'
  }});
  if(!allowedHosts.has(host))return new Response('Invalid H-Global origin',{status:403});
  if(!env.HGLOBAL_DB || String(env.HGLOBAL_SSO_EXCHANGE_SECRET||'').length<32){
    return new Response('H-Global Starry ID login is not configured yet',{status:503,headers:{
      'cache-control':'no-store','content-type':'text/plain; charset=utf-8'
    }});
  }
  const state=randomSecret();
  const central=new URL('https://id.starry.phd/auth/hglobal');
  central.searchParams.set('state',state);
  if(host===PREVIEW_HOST)central.searchParams.set('preview','1');
  return new Response(null,{status:302,headers:{
    'location':central.href,'Set-Cookie':setStateCookie(state),
    'cache-control':'no-store','referrer-policy':'no-referrer'
  }});
}
