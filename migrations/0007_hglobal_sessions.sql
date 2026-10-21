-- 0007: H-Global-local, revocable sessions after Starry ID handoff.
-- NEVER replicate central Starry ID cookies, Google credentials or passwords.
CREATE TABLE IF NOT EXISTS hglobal_auth_sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_hglobal_sessions_member ON hglobal_auth_sessions(member_id);
CREATE INDEX IF NOT EXISTS idx_hglobal_sessions_expiry ON hglobal_auth_sessions(expires_at);
