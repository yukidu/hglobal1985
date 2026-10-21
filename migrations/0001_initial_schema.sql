-- H-Global D1 initial schema. Test database only; no production data.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  checksum TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  identity_provider TEXT NOT NULL DEFAULT 'starry_id',
  external_subject TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  rank_label TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled','pending')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS member_roles (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL CHECK(role_code IN ('super_admin','global_secretary','moderator','president','vice_president','course_admin','editor')),
  assigned_by TEXT REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(member_id, role_code)
);

CREATE TABLE IF NOT EXISTS menu_prefixes (
  id TEXT PRIMARY KEY,
  menu_key TEXT NOT NULL UNIQUE,
  prefix_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  updated_by TEXT REFERENCES members(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
  menu_key TEXT NOT NULL,
  title TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  content_html TEXT NOT NULL DEFAULT '',
  source_wp_id INTEGER,
  source_title TEXT,
  source_snapshot TEXT NOT NULL DEFAULT '',
  access_level TEXT NOT NULL DEFAULT 'public' CHECK(access_level IN ('public','members','rank')),
  required_rank TEXT,
  share_enabled INTEGER NOT NULL DEFAULT 1 CHECK(share_enabled IN (0,1)),
  subscribable INTEGER NOT NULL DEFAULT 1 CHECK(subscribable IN (0,1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES members(id),
  updated_by TEXT REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pages_menu_sort ON pages(menu_key, status, sort_order);

CREATE TABLE IF NOT EXISTS page_moderators (
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  assigned_by TEXT REFERENCES members(id),
  role_code TEXT NOT NULL DEFAULT 'moderator' CHECK(role_code IN ('moderator','president','vice_president','course_admin','editor')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(page_id, member_id, role_code)
);

CREATE TABLE IF NOT EXISTS page_revisions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  content_html TEXT NOT NULL,
  changed_by TEXT REFERENCES members(id),
  change_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(page_id, revision_no)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  channel_in_app INTEGER NOT NULL DEFAULT 1 CHECK(channel_in_app IN (0,1)),
  channel_push INTEGER NOT NULL DEFAULT 1 CHECK(channel_push IN (0,1)),
  channel_email INTEGER NOT NULL DEFAULT 0 CHECK(channel_email IN (0,1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(member_id, page_id)
);

CREATE TABLE IF NOT EXISTS reminder_schedules (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  remind_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  target_url TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_member_created ON notifications(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '總部消息',
  summary TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  source_asset_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_review','published','archived')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_by TEXT REFERENCES members(id),
  updated_by TEXT REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(status, pinned DESC, published_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  information_html TEXT NOT NULL DEFAULT '',
  edm_asset_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_review','published','closed','archived')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  registration_opens_at TEXT,
  registration_closes_at TEXT,
  created_by TEXT REFERENCES members(id),
  updated_by TEXT REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_events_status_sort ON events(status, pinned DESC, sort_order);

CREATE TABLE IF NOT EXISTS event_sessions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  venue_text TEXT NOT NULL DEFAULT '',
  capacity INTEGER,
  fee_amount INTEGER,
  fee_currency TEXT NOT NULL DEFAULT 'TWD',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_event_sessions_event ON event_sessions(event_id, sort_order);

CREATE TABLE IF NOT EXISTS event_fields (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK(field_type IN ('text','textarea','number','select','multiselect','date','phone','email','checkbox','radio')),
  required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0,1)),
  options_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(event_id, field_key)
);

CREATE TABLE IF NOT EXISTS event_registrations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES event_sessions(id) ON DELETE SET NULL,
  member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','confirmed','waitlisted','cancelled','rejected')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','pending','paid','refunded','not_required')),
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_registrations_event ON event_registrations(event_id, status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS event_registration_values (
  registration_id TEXT NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL REFERENCES event_fields(id) ON DELETE CASCADE,
  value_text TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(registration_id, field_id)
);

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description_html TEXT NOT NULL DEFAULT '',
  address_text TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES members(id),
  updated_by TEXT REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS venue_resources (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS venue_slots (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  price_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TWD',
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','blocked','maintenance')),
  UNIQUE(venue_id, starts_at, ends_at)
);
CREATE INDEX IF NOT EXISTS idx_venue_slots_time ON venue_slots(venue_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS venue_bookings (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
  slot_id TEXT REFERENCES venue_slots(id) ON DELETE RESTRICT,
  member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  total_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TWD',
  reviewed_by TEXT REFERENCES members(id),
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_venue_bookings_time ON venue_bookings(venue_id, starts_at, ends_at, status);

CREATE TABLE IF NOT EXISTS venue_booking_resources (
  booking_id TEXT NOT NULL REFERENCES venue_bookings(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES venue_resources(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  PRIMARY KEY(booking_id, resource_id)
);

CREATE TABLE IF NOT EXISTS intake_submissions (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK(source_type IN ('line_image','edm_upload','manual')),
  content_type TEXT NOT NULL CHECK(content_type IN ('news','schedule','event_info','other')),
  source_reference TEXT,
  asset_key TEXT,
  extracted_text TEXT NOT NULL DEFAULT '',
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected','published')),
  reviewed_by TEXT REFERENCES members(id),
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS audio_external_refs (
  id TEXT PRIMARY KEY,
  source_system TEXT NOT NULL DEFAULT 'echo_starry',
  source_audio_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  speaker_label TEXT NOT NULL DEFAULT '',
  read_only INTEGER NOT NULL DEFAULT 1 CHECK(read_only = 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','hidden')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(source_system, source_audio_id)
);

CREATE TABLE IF NOT EXISTS admin_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_by TEXT REFERENCES members(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_member_id TEXT REFERENCES members(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
