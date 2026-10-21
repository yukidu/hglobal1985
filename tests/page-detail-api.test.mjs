import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../functions/api/v1/page.js', import.meta.url), 'utf8');
const { onRequestGet } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const request = q => new Request('https://example.test/api/v1/page' + q);
function database(result) {
  const state = {};
  return { state, prepare(sql) {
    state.sql = sql;
    return { bind(...args) {
      state.args = args;
      return { first: async () => result };
    } };
  } };
}
test('public page requires database', async () => {
  assert.equal((await onRequestGet({ request: request('?public_id=10'), env: {} })).status, 503);
});
test('public page rejects malformed IDs', async () => {
  for (const q of ['', '?public_id=../10', '?public_id=abc', '?public_id=1234567890123', '?public_id=1%20OR%201']) {
    assert.equal((await onRequestGet({ request: request(q), env: { HGLOBAL_DB: database(null) } })).status, 400);
  }
});
test('public page filters unpublished/private records in SQL', async () => {
  const db = database({ public_id: '008888', title: '公開頁面', content_html: '<p>內容</p>' });
  const r = await onRequestGet({ request: request('?public_id=008888'), env: { HGLOBAL_DB: db } });
  assert.equal(r.status, 200);
  assert.deepEqual(db.state.args, ['008888']);
  assert.match(db.state.sql, /status = 'published'/);
  assert.match(db.state.sql, /access_level = 'public'/);
  assert.doesNotMatch(db.state.sql, /source_snapshot|source_wp_id|members/);
  assert.equal((await r.json()).page.title, '公開頁面');
});
test('public page returns 404 without leaking unpublished page existence', async () => {
  const r = await onRequestGet({ request: request('?public_id=24'), env: { HGLOBAL_DB: database(null) } });
  assert.equal(r.status, 404);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('public page redacts database exceptions', async () => {
  const r = await onRequestGet({ request: request('?public_id=24'), env: { HGLOBAL_DB: { prepare() { throw Error('sensitive SQL'); } } } });
  assert.equal(r.status, 503);
  assert.doesNotMatch(await r.text(), /sensitive SQL/);
});
