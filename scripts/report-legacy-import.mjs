// Read-only import readiness report. No network, Cloudflare, or database writes.
// Usage: node scripts/report-legacy-import.mjs /path/to/manifest.json
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { validateManifest } from './validate-legacy-manifest.mjs';

export function summarize(manifest) {
  const errors = validateManifest(manifest);
  if (errors.length) return { ready: false, errors };
  const pages = manifest.pages;
  const system = pages.filter(p => p.kind === 'system' || p.kind === 'plugin').length;
  const content = pages.filter(p => p.kind === 'content').length;
  const unspecified = pages.length - system - content;
  const mediaReferences = pages.reduce((total, p) => {
    const html = p.source_html;
    const matches = html.match(/(?:src|href)\s*=\s*["'][^"']+\.(?:png|jpe?g|gif|webp|svg|pdf|mp3|mp4)(?:[?#][^"']*)?["']/gi);
    return total + (matches ? matches.length : 0);
  }, 0);
  return {
    ready: true,
    source_pages: pages.length,
    content_pages: content,
    system_or_plugin_pages: system,
    unclassified_pages: unspecified,
    media_references_estimated: mediaReferences,
    reviewed_pages: 0,
    published_pages: 0,
    note: 'Readiness validates source integrity only. Publication requires separate review and authorization.'
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/report-legacy-import.mjs manifest.json');
    process.exitCode = 2;
  } else {
    try {
      const report = summarize(JSON.parse(await readFile(file, 'utf8')));
      console.log(JSON.stringify(report, null, 2));
      if (!report.ready) process.exitCode = 1;
    } catch (error) {
      console.error('Unable to read legacy manifest:', error.message);
      process.exitCode = 1;
    }
  }
}
