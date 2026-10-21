# Public Pages API — Preview batch 2

Endpoint: `GET /api/v1/pages`

Purpose: return a **public-only page directory** for future CMS navigation integration. This is not a CMS editor or page body API.

## Contract
- `limit`: default 20, integer 1–50.
- `offset`: default 0, integer 0–10000.
- Invalid parameters return HTTP 400 `{"error":"invalid_pagination"}`.
- Missing D1 binding returns HTTP 503 `{"error":"database_unavailable"}`.
- Database errors return HTTP 503 without leaking SQL details.
- Each item contains only `public_id`, `title`, `menu_key`, `sort_order`, `updated_at`.
- The SQL query enforces `status='published'` and `access_level='public'`.
- No source snapshots, HTML body, private/member pages, editor metadata or draft data are returned.

## Before acceptance
1. Confirm the Preview D1 `HGLOBAL_DB` binding and migration version.
2. Call `/api/v1/pages` and verify empty or public-only list.
3. Test `limit=0`, `limit=51`, `limit=abc`, `offset=-1` → 400.
4. Test `limit=1&offset=0` → 200 with valid pagination.
5. Add a published public fixture and a published members-only fixture to **Preview only**; ensure only the public record is listed.
6. Verify Preview remains noindex and no production domain/D1 is bound.

## Deferred
- CMS page editing, role-scoped writes, HTML sanitization, URL slug/history redirects, Starry ID auth and audit logs.
- Do not expose `content_html` or `source_snapshot` before a separately reviewed content access-control and sanitization implementation.
