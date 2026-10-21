import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../functions/api/v1/pages.js', import.meta.url), 'utf8');
const { onRequestGet } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const req = (q = '') => new Request('https://preview.example.test/api/v1/pages' + q);
function db(rows = []) {
  const state = { sql: '', params: [] };
  return {
    state,
    prepare(sql) {
      state.sql = sql;
      return { bind(...params) {
        state.params = params;
        return { all: async () => ({ results: rows }) };
      } };
    }
  };
}
test('pages: rejects missing D1 and never caches errors', async () => {
  const response = await onRequestGet({ env: {}, request: req() });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('pages: pagination strictly validated', async () => {
  for (const query of ['?limit=0','?limit=51','?limit=abc','?limit=-1','?offset=-1','?offset=10001','?offset=1.5']) {
    const response = await onRequestGet({ env: { HGLOBAL_DB: db() }, request: req(query) });
    assert.equal(response.status, 400, query);
  }
});
test('pages: SQL always filters published public pages and uses parameters', async () => {
  const database = db([{ public_id: '008888', title: '測試', menu_key: 'about', sort_order: 0 }]);
  const response = await onRequestGet({ env: { HGLOBAL_DB: database }, request: req('?limit=1&offset=2') });
  assert.equal(response.status, 200);
  assert.deepEqual(database.state.params, [1, 2]);
  assert.match(database.state.sql, /status\s*=\s*'published'/);
  assert.match(database.state.sql, /access_level\s*=\s*'public'/);
  assert.match(database.state.sql, /LIMIT \? OFFSET \?/);
  const body = await response.json();
  assert.equal(body.data.length, 1);
  assert.deepEqual(body.pagination, { limit: 1, offset: 2, count: 1 });
});
test('pages: database exceptions are redacted', async () => {
  const response = await onRequestGet({ env: { HGLOBAL_DB: { prepare() { throw Error('secret'); } } }, request: req() });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret/);
});
