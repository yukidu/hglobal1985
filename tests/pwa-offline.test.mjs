import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=path=>readFile(new URL(path,import.meta.url),'utf8');
test('installable PWA references branded icon, standalone viewport and offline shell',async()=>{
 const manifest=JSON.parse(await src('../public/manifest.webmanifest'));
 const html=await src('../public/index.html');
 assert.equal(manifest.display,'standalone');
 assert.equal(manifest.start_url,'/');
 assert.ok(manifest.icons.some(icon=>icon.src==='/hglobal-icon.svg'&&icon.purpose.includes('maskable')));
 assert.match(html,/href="\/manifest\.webmanifest"/);
 assert.match(html,/src="\/pwa-register\.js"/);
 assert.ok((await src('../public/hglobal-icon.svg')).includes('<svg'));
});
test('service worker never caches API, auth, admin or authenticated requests',async()=>{
 const sw=await src('../public/sw.js');
 assert.match(sw,/req\.method==='GET'/);
 assert.match(sw,/url\.origin===self\.location\.origin/);
 for(const pathname of ["'/api/'","'/auth/'","'/admin/'"]) assert.ok(sw.includes(pathname));
 assert.match(sw,/Authorization/);
 assert.match(sw,/Cookie/);
 assert.doesNotMatch(sw,/caches\.put\(request,\s*response\)/);
 assert.match(sw,/cache\.put\(request,response\.clone\(\)\)/);
});
