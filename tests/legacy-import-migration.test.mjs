import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../migrations/0002_legacy_import_staging.sql', import.meta.url), 'utf8');

test('legacy import staging creates independent source, revision and media tables', () => {
  for (const table of ['legacy_import_batches', 'legacy_source_pages', 'legacy_source_revisions', 'legacy_media_audit']) {
    assert.match(sql, new RegExp('CREATE TABLE IF NOT EXISTS\\s+' + table + '\\s*\\(', 'i'));
  }
});
test('legacy source pages are review-gated and batch-linked', () => {
  assert.match(sql, /review_status\s+TEXT\s+NOT NULL\s+DEFAULT\s+'pending'/i);
  assert.match(sql, /batch_id\s+TEXT\s+NOT NULL\s+REFERENCES\s+legacy_import_batches\(id\)/i);
  assert.match(sql, /CHECK\(expected_count = 37\)/i);
});
test('migration has no direct writes to published CMS pages', () => {
  assert.doesNotMatch(sql, /^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(pages|page_revisions)\b/im);
  assert.doesNotMatch(sql, /CREATE\s+TRIGGER/i);
});
