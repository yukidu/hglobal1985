import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const account=await readFile(new URL('../public/account/account.js',import.meta.url),'utf8');

test('Preview advertises unfinished central SSO and keeps one-click subscription gated',()=>{
 assert.match(html,/架構預覽版/);
 assert.match(html,/會員登入需 Starry ID 正式接線/);
 assert.match(html,/id="subscribePage"[^>]*disabled/);
 assert.match(html,/訂閱尚未開放/);
 assert.doesNotMatch(html,/已加入本機示意訂閱/);
});
test('CMS and subscriptions shortcuts open authenticated account UI, not fake local actions',()=>{
 assert.match(html,/id="editPage"/);
 assert.match(html,/id="viewSubscriptions"/);
 assert.match(html,/id="subscriptionShortcut"/);
 assert.match(html,/location\.assign\('\/account\/\?tab=admin'\)/);
 assert.match(html,/location\.assign\('\/account\/\?tab=subscriptions'\)/);
 assert.match(account,/credentials:'same-origin'/);
 assert.match(account,/\/api\/v1\/members\/me/);
});
