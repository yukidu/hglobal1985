import {randomSecret,setStateCookie} from '../_lib/hglobal-session.js';

const PREVIEW_HOST='feat-test-environment-founda.hglobal-preview.pages.dev';
const allowedHosts=new Set(['hglobal1985.com','www.hglobal1985.com',PREVIEW_HOST]);
export async function onRequestGet({request,env}){
  const host=new URL(request.url).hostname.toLowerCase();
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
  const response=Response.redirect(central.href,302);
  response.headers.append('Set-Cookie',setStateCookie(state));
  response.headers.set('cache-control','no-store');
  response.headers.set('referrer-policy','no-referrer');
  return response;
}
