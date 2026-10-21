-- H-Global 0002: source-import staging, isolated from published CMS pages.
-- Apply to Preview D1 only after migration review. This file does not publish anything.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS legacy_import_batches (
  id TEXT PRIMARY KEY,
  source_label TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256) = 64),
  expected_count INTEGER NOT NULL DEFAULT 37 CHECK(expected_count = 37),
  status TEXT NOT NULL DEFAULT 'staged' CHECK(status IN ('staged','reviewed','rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS legacy_source_pages (
  source_wp_id INTEGER PRIMARY KEY CHECK(source_wp_id > 0),
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  source_html TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256) = 64),
  batch_id TEXT NOT NULL REFERENCES legacy_import_batches(id),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES members(id),
  reviewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_legacy_pages_review ON legacy_source_pages(review_status, source_wp_id);

CREATE TABLE IF NOT EXISTS legacy_source_revisions (
  source_wp_id INTEGER NOT NULL REFERENCES legacy_source_pages(source_wp_id) ON DELETE CASCADE,
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256) = 64),
  source_html TEXT NOT NULL,
  source_title TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(source_wp_id, source_sha256)
);

CREATE TABLE IF NOT EXISTS legacy_media_audit (
  source_wp_id INTEGER NOT NULL REFERENCES legacy_source_pages(source_wp_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  source_url TEXT NOT NULL DEFAULT '',
  asset_kind TEXT NOT NULL CHECK(asset_kind IN ('image','audio','video','document','other')),
  state TEXT NOT NULL DEFAULT 'missing' CHECK(state IN ('missing','located','verified','rejected')),
  storage_key TEXT,
  PRIMARY KEY(source_wp_id, ordinal)
);

-- Explicitly no triggers or writes into pages/page_revisions. Publication requires
-- a separately authenticated, reviewed CMS workflow.
