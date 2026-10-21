import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateManifest } from '../scripts/validate-legacy-manifest.mjs';

function manifest() {
  return { pages: Array.from({ length: 37 }, (_, i) => {
    const source_html = '<h1>Legacy page ' + (i + 1) + '</h1>';
    return {
      source_wp_id: i + 1,
      source_title: 'Page ' + (i + 1),
      source_url: 'https://hglobal1985.com/page-' + (i + 1),
      source_html,
      source_sha256: createHash('sha256').update(source_html).digest('hex'),
      review_status: 'pending'
    };
  }) };
}
test('legacy manifest: validates 37 unique source pages with exact HTML hashes', () => {
  assert.deepEqual(validateManifest(manifest()), []);
});
test('legacy manifest: rejects missing or extra pages', () => {
  const m = manifest(); m.pages.pop();
  assert.match(validateManifest(m).join(','), /exactly 37/);
});
test('legacy manifest: rejects duplicate WordPress IDs', () => {
  const m = manifest(); m.pages[1].source_wp_id = 1;
  assert.match(validateManifest(m).join(','), /duplicated/);
});
test('legacy manifest: rejects modified HTML after hash calculation', () => {
  const m = manifest(); m.pages[0].source_html += '<script>alert(1)</script>';
  assert.match(validateManifest(m).join(','), /mismatch/);
});
test('legacy manifest: rejects preapproved import and insecure URL', () => {
  const m = manifest(); m.pages[0].review_status = 'approved'; m.pages[1].source_url = 'http://example.com';
  const errors = validateManifest(m).join(',');
  assert.match(errors, /pending/);
  assert.match(errors, /https/);
});
