import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function load(name) {
  const src = await readFile(new URL('../functions/api/v1/' + name + '.js', import.meta.url), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}
function db() {
  const state = { args: [], sql: '' };
  return { state, prepare(sql) {
    state.sql = sql;
    return { bind(...args) {
      state.args = args;
      return { all: async () => ({ results: [] }) };
    } };
  } };
}
for (const name of ['events', 'venues']) {
  test(name + ': rejects malformed and out-of-bounds pagination', async () => {
    const { onRequestGet } = await load(name);
    for (const query of ['?limit=0', '?limit=51', '?limit=2abc', '?limit=-1', '?limit=1.5', '?offset=-1', '?offset=10001', '?offset=2e3']) {
      const response = await onRequestGet({
        env: { HGLOBAL_DB: db() },
        request: new Request('https://preview.example/api/v1/' + name + query)
      });
      assert.equal(response.status, 400, query);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  });
  test(name + ': defaults to bounded parameters and hides unpublished data', async () => {
    const { onRequestGet } = await load(name);
    const database = db();
    const response = await onRequestGet({
      env: { HGLOBAL_DB: database },
      request: new Request('https://preview.example/api/v1/' + name)
    });
    assert.equal(response.status, 200);
    assert.deepEqual(database.state.args, [20, 0]);
    assert.match(database.state.sql, name === 'events' ? /status = 'published'/ : /status = 'active'/);
    assert.deepEqual((await response.json()).pagination, { limit: 20, offset: 0, count: 0 });
  });
  test(name + ': database errors are not cached or leaked', async () => {
    const { onRequestGet } = await load(name);
    const response = await onRequestGet({
      env: { HGLOBAL_DB: { prepare() { throw Error('private database info'); } } },
      request: new Request('https://preview.example/api/v1/' + name)
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(await response.text(), /private database info/);
  });
}
