#!/usr/bin/env node
/**
 * Read-only integrity check for the user-supplied legacy safe-preview HTML.
 * Usage: node scripts/check-legacy-html.mjs "/path/to/legacy-preview.html"
 * Does not execute HTML scripts, fetch remote assets, or write to a database.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error("Usage: node scripts/check-legacy-html.mjs <legacy-preview.html>");
  process.exit(2);
}
const html = readFileSync(resolve(sourcePath), "utf8");
const sectionMatches = [...html.matchAll(/<section\b(?=[^>]*\bclass=["'][^"']*\bpage\b[^"']*["'])([^>]*)>/gi)];
const navMatches = [...html.matchAll(/\bclass=["'][^"']*\btreeitem\b[^"']*["']/gi)];
const ids = sectionMatches.map((match) => {
  const found = match[1].match(/\bid=["']p-(\d+)["']/i);
  return found?.[1] ?? null;
});
const expectedIds = [
  "4508", "2522", "2520", "24", "2521", "2518", "2519", "2934", "63",
  "468", "131", "228", "230", "236", "234", "232", "148", "240", "1646",
  "10", "100", "718", "721", "37", "739", "35", "28", "350", "420",
  "4008", "39", "30", "51", "346", "2952", "2246", "4695"
];
const duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i);
const missingIds = expectedIds.filter((id) => !ids.includes(id));
const extraIds = ids.filter((id) => id && !expectedIds.includes(id));
const report = {
  source: sourcePath,
  pageCount: sectionMatches.length,
  navigationCount: navMatches.length,
  expectedPageCount: expectedIds.length,
  missingIds, extraIds, duplicateIds,
  hasUnidentifiedPages: ids.some((id) => !id),
  safePreviewOnly: true,
  note: "Page presence only. Does not validate body completeness, image files, media, or original WordPress database."
};
console.log(JSON.stringify(report, null, 2));
if (report.pageCount !== 37 || report.navigationCount !== 37 ||
    missingIds.length || extraIds.length || duplicateIds.length || report.hasUnidentifiedPages) {
  process.exitCode = 1;
}
