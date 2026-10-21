// H-Global offline app shell; API/auth/private member responses are NEVER cached.
const VERSION='hglobal-public-v1';
const STATIC=['/','/index.html','/theme.css','/live-listings.js','/manifest.webmanifest','/hglobal-icon.svg'];
const CACHE_PREFIX='hglobal-public-';
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(STATIC)));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==VERSION).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
function cacheable(req,url){
  return req.method==='GET' && url.origin===self.location.origin &&
    !url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/auth/') &&
    !url.pathname.startsWith('/admin/') &&
    !url.pathname.startsWith('/account/') &&
    !req.headers.has('Authorization') &&
    !req.headers.has('Cookie');
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(!cacheable(request,url))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>caches.match('/index.html').then(r=>r||Response.error())));
    return;
  }
  if(!STATIC.includes(url.pathname))return;
  event.respondWith(caches.match(request,{ignoreSearch:true}).then(cached=>
    cached||fetch(request).then(async response=>{
      if(response.ok && response.type==='basic'){
        const cache=await caches.open(VERSION);
        await cache.put(request,response.clone());
      }
      return response;
    })
  ));
});
