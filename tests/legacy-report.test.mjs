import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { summarize } from '../scripts/report-legacy-import.mjs';
function sample() {
  return { pages: Array.from({ length: 37 }, (_, i) => {
    const source_html = i === 0 ? '<img src="https://example.com/pic.png"><a href="file.pdf">PDF</a>' : '<p>page</p>';
    return {
      source_wp_id: i + 1,
      source_title: 'Page ' + i,
      source_url: 'https://hglobal1985.com/page/' + i,
      source_html,
      source_sha256: createHash('sha256').update(source_html).digest('hex'),
      kind: i < 25 ? 'content' : 'plugin'
    };
  }) };
}
test('import report counts classified pages and referenced media without publishing', () => {
  const result = summarize(sample());
  assert.equal(result.ready, true);
  assert.equal(result.source_pages, 37);
  assert.equal(result.content_pages, 25);
  assert.equal(result.system_or_plugin_pages, 12);
  assert.equal(result.media_references_estimated, 2);
  assert.equal(result.published_pages, 0);
});
test('import report refuses corrupted manifests', () => {
  const m = sample(); m.pages[0].source_html += 'changed';
  const result = summarize(m);
  assert.equal(result.ready, false);
  assert.match(result.errors.join(','), /sha256 mismatch/);
});
