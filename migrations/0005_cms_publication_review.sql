-- H-Global D1 0005: two-person review and fail-closed CMS publication.
-- Apply on isolated Preview D1 only. No existing pages are published by this file.
CREATE TABLE IF NOT EXISTS cms_publication_requests (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL CHECK(revision_no > 0),
  requested_by TEXT NOT NULL REFERENCES members(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewer_id TEXT REFERENCES members(id),
  review_note TEXT NOT NULL DEFAULT '',
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT,
  CHECK(reviewer_id IS NULL OR reviewer_id <> requested_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_one_pending_request_per_page
  ON cms_publication_requests(page_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_cms_review_status
  ON cms_publication_requests(status,requested_at);

-- No direct public inserts: pages must enter as a draft and pass review.
CREATE TRIGGER IF NOT EXISTS trg_pages_deny_direct_publish_insert
BEFORE INSERT ON pages
WHEN NEW.status='published'
BEGIN
  SELECT RAISE(ABORT,'publication_requires_approval');
END;

CREATE TRIGGER IF NOT EXISTS trg_pages_require_two_person_review
BEFORE UPDATE OF status ON pages
WHEN NEW.status='published' AND OLD.status <> 'published'
BEGIN
  SELECT RAISE(ABORT,'publication_requires_approval') WHERE
    NEW.access_level <> 'public'
    OR NEW.source_wp_id IS NOT NULL
    OR COALESCE(NEW.source_snapshot,'') <> ''
    OR NOT EXISTS (
      SELECT 1 FROM cms_publication_requests q
      JOIN page_revisions r ON r.page_id=q.page_id AND r.revision_no=q.revision_no
      WHERE q.page_id=NEW.id
        AND q.status='approved'
        AND q.reviewer_id IS NOT NULL
        AND q.reviewer_id<>q.requested_by
        AND q.revision_no=(SELECT MAX(r2.revision_no) FROM page_revisions r2 WHERE r2.page_id=NEW.id)
        AND NEW.title=r.title AND NEW.content_html=r.content_html
    );
END;

-- Published body is immutable until an explicit unpublish/return-to-draft workflow.
CREATE TRIGGER IF NOT EXISTS trg_pages_protect_published_content
BEFORE UPDATE OF title,menu_key,content_html,source_snapshot,source_wp_id ON pages
WHEN OLD.status='published'
BEGIN
  SELECT RAISE(ABORT,'published_content_immutable');
END;
