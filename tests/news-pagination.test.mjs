import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const src = await readFile(new URL('../functions/api/v1/news.js', import.meta.url), 'utf8');
const { onRequestGet } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const request = query => new Request('https://preview.example/api/v1/news' + query);
const mock = () => {
  const state = {};
  return { state, prepare(sql) {
    state.sql = sql;
    return { bind(...args) {
      state.args = args;
      return { all: async () => ({ results: [] }) };
    } };
  } };
};
test('news rejects malformed and out-of-range pagination', async () => {
  for (const query of ['?limit=0', '?limit=51', '?limit=2abc', '?limit=-1', '?offset=-1', '?offset=10001', '?offset=1.5']) {
    const response = await onRequestGet({ request: request(query), env: { HGLOBAL_DB: mock() } });
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});
test('news applies safe SQL parameters and published filter', async () => {
  const db = mock();
  const response = await onRequestGet({ request: request('?limit=4&offset=2'), env: { HGLOBAL_DB: db } });
  assert.equal(response.status, 200);
  assert.deepEqual(db.state.args, [4, 2]);
  assert.match(db.state.sql, /status = 'published'/);
  assert.deepEqual((await response.json()).pagination, { limit: 4, offset: 2, count: 0 });
});
test('news errors are not cached and internal details are redacted', async () => {
  const response = await onRequestGet({ request: request(''), env: { HGLOBAL_DB: { prepare() { throw Error('secret SQL'); } } } });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await response.text(), /secret SQL/);
});
