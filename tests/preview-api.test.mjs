// Preview API contract tests; no external services or production credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadRoute(name) {
  const code = await readFile(new URL('../functions/api/v1/' + name + '.js', import.meta.url), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
function request(path) { return new Request('https://preview.example.test' + path); }
function fakeDb(rows = []) {
  const state = { sql: '', params: [] };
  return {
    state,
    prepare(sql) {
      state.sql = sql;
      return {
        bind(...params) {
          state.params = params;
          return { all: async () => ({ results: rows }) };
        },
        first: async () => ({ version: '0001', applied_at: '2026-10-20' })
      };
    }
  };
}
for (const name of ['news', 'events', 'venues']) {
  test(name + ': requires its own database binding', async () => {
    const { onRequestGet } = await loadRoute(name);
    const response = await onRequestGet({ env: {}, request: request('/api/v1/' + name) });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'preview_database_not_bound');
  });
  test(name + ': returns bounded pagination and parameterized SQL', async () => {
    const { onRequestGet } = await loadRoute(name);
    const db = fakeDb([{ id: 'demo' }]);
    const response = await onRequestGet({
      env: { HGLOBAL_DB: db },
      request: request('/api/v1/' + name + '?limit=999&offset=999999')
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.pagination, { limit: 50, offset: 10000, count: 1 });
    assert.deepEqual(db.state.params, [50, 10000]);
    assert.match(db.state.sql, /LIMIT \? OFFSET \?/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });
  test(name + ': does not expose SQL errors', async () => {
    const { onRequestGet } = await loadRoute(name);
    const response = await onRequestGet({
      env: { HGLOBAL_DB: { prepare: () => { throw Error('sensitive database detail'); } } },
      request: request('/api/v1/' + name)
    });
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /sensitive database detail/);
  });
}
test('health: missing database fails closed and disables caching', async () => {
  const { onRequestGet } = await loadRoute('health');
  const response = await onRequestGet({ env: {} });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('health: connected database reports schema without secrets', async () => {
  const { onRequestGet } = await loadRoute('health');
  const response = await onRequestGet({ env: { HGLOBAL_DB: fakeDb() } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.database, 'connected');
});
