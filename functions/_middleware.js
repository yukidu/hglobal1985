// Cloudflare Pages Function middleware: block cross-origin cookie-CSRF writes.
// Does not change existing bearer-token server-to-server API clients.
export async function onRequest({request,next}){
  const url=new URL(request.url);
  const method=request.method.toUpperCase();
  const guarded=(url.pathname.startsWith('/api/v1/')||url.pathname==='/auth/logout') &&
    ['POST','PUT','PATCH','DELETE'].includes(method);
  if(guarded){
    const origin=request.headers.get('Origin');
    const fetchSite=request.headers.get('Sec-Fetch-Site');
    if((origin && origin!==url.origin) ||
       fetchSite==='cross-site' ||
       (!origin && !request.headers.has('Authorization'))){
      return new Response(JSON.stringify({error:'cross_origin_write_forbidden'}),{
        status:403,headers:{
          'content-type':'application/json; charset=utf-8',
          'cache-control':'no-store',
          'x-content-type-options':'nosniff'
        }
      });
    }
  }
  const response=await next();
  const headers=new Headers(response.headers);
  headers.set('x-content-type-options','nosniff');
  headers.set('referrer-policy','strict-origin-when-cross-origin');
  if(url.pathname.startsWith('/api/v1/')||url.pathname.startsWith('/auth/')){
    headers.set('cache-control','no-store');
  }
  return new Response(response.body,{
    status:response.status,statusText:response.statusText,headers
  });
}
