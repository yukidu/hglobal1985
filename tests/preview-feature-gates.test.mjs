import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
test('preview clearly labels unfinished capabilities', () => {
  assert.match(html, /架構預覽版/);
  assert.match(html, /id="editPage" disabled/);
  assert.match(html, /id="viewSubscriptions" disabled/);
  assert.match(html, /id="subscriptionShortcut" disabled/);
  assert.match(html, /id="subscribePage"[^>]*disabled/);
});
test('preview does not claim local subscription success', () => {
  assert.doesNotMatch(html, /已加入本機示意訂閱/);
  assert.match(html, /訂閱尚未開放/);
});
