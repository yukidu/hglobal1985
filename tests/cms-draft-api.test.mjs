import test from 'node:test';
import assert from 'node:assert/strict';
import {draftInput,safeTextHtml} from '../functions/_lib/cms-draft.js';
import {onRequestPost,onRequestGet} from '../functions/api/v1/admin/page-drafts.js';

test('CMS restricts accepted primary menu keys, numeric public IDs and text size',()=>{
  const valid={public_id:'008888',title:'台北寰宇商務空間',menu_key:'場地租借',text:'第一段'};
  assert.equal(draftInput(valid).public_id,'008888');
  for(const changed of [
    {public_id:'../bad'},{title:''},{menu_key:'管理員'},
    {text:'x'.repeat(24001)},{public_id:8888}
  ])assert.equal(draftInput({...valid,...changed}),null);
});
test('CMS escapes HTML and event handlers while retaining text',()=>{
  const html=safeTextHtml('<img src=x onerror=alert(1)>\n<script>alert(1)</script> & \"quoted\"');
  assert.doesNotMatch(html,/<img|<script/i);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/&amp;/);
  assert.match(html,/&quot;/);
  assert.match(html,/^<p>.*<\/p><p>.*<\/p>$/);
});
test('both admin CMS endpoints reject anonymous visitors',async()=>{
  for(const handler of [onRequestGet,onRequestPost]){
    const result=await handler({request:new Request('https://preview.example.test/api/v1/admin/page-drafts'),
      env:{HGLOBAL_DB:{}}});
    assert.equal(result.status,401);
    assert.equal((await result.json()).error,'authentication_required');
  }
});
