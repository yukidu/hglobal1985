// H-Global legacy WordPress export manifest validator.
// Usage: node scripts/validate-legacy-manifest.mjs path/to/manifest.json
// Read-only: never writes to D1, Cloudflare, CMS, or the input file.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['manifest must be an object'];
  if (!Array.isArray(manifest.pages) || manifest.pages.length !== 37) {
    errors.push('manifest.pages must contain exactly 37 entries');
    return errors;
  }
  const seen = new Set();
  for (const [i, page] of manifest.pages.entries()) {
    const at = 'pages[' + i + ']';
    if (!page || typeof page !== 'object' || Array.isArray(page)) {
      errors.push(at + ' must be an object');
      continue;
    }
    if (!Number.isSafeInteger(page.source_wp_id) || page.source_wp_id <= 0) errors.push(at + '.source_wp_id invalid');
    else if (seen.has(page.source_wp_id)) errors.push(at + '.source_wp_id duplicated');
    else seen.add(page.source_wp_id);
    if (typeof page.source_title !== 'string' || !page.source_title.trim()) errors.push(at + '.source_title missing');
    if (typeof page.source_html !== 'string') errors.push(at + '.source_html missing');
    if (typeof page.source_url !== 'string') errors.push(at + '.source_url missing');
    else if (page.source_url && !/^https:\/\//i.test(page.source_url)) errors.push(at + '.source_url must use https');
    if (typeof page.source_html === 'string') {
      const actual = createHash('sha256').update(page.source_html, 'utf8').digest('hex');
      if (page.source_sha256 !== actual) errors.push(at + '.source_sha256 mismatch');
    }
    if (page.review_status && page.review_status !== 'pending') errors.push(at + '.review_status must be pending for initial import');
  }
  return errors;
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node scripts/validate-legacy-manifest.mjs manifest.json');
    process.exitCode = 2;
  } else {
    try {
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      const errors = validateManifest(manifest);
      if (errors.length) {
        console.error(errors.join('\n'));
        process.exitCode = 1;
      } else {
        console.log('Legacy manifest valid: 37 unique pages, verified SHA-256, review pending');
      }
    } catch (error) {
      console.error('Cannot validate manifest:', error.message);
      process.exitCode = 1;
    }
  }
}
