-- H-Global D1: membership-bound registration uniqueness and capacity.
-- Must run preflight first; never modify or delete existing registrations.
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_registrations_unique_active_member_session
ON event_registrations(event_id,session_id,member_id)
WHERE status IN ('submitted','confirmed','waitlisted') AND member_id IS NOT NULL AND session_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_event_registration_guard_insert
BEFORE INSERT ON event_registrations
WHEN NEW.status IN ('submitted','confirmed','waitlisted')
BEGIN
 SELECT RAISE(ABORT,'registration_identity_required') WHERE NEW.member_id IS NULL OR NEW.session_id IS NULL;
 SELECT RAISE(ABORT,'event_not_open') WHERE NOT EXISTS (
   SELECT 1 FROM events e WHERE e.id=NEW.event_id AND e.status='published'
   AND (e.registration_opens_at IS NULL OR e.registration_opens_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   AND (e.registration_closes_at IS NULL OR e.registration_closes_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 );
 SELECT RAISE(ABORT,'registration_session_mismatch') WHERE NOT EXISTS (
   SELECT 1 FROM event_sessions s WHERE s.id=NEW.session_id AND s.event_id=NEW.event_id
 );
 SELECT RAISE(ABORT,'registration_session_full') WHERE NEW.status IN ('submitted','confirmed') AND EXISTS (
   SELECT 1 FROM event_sessions s WHERE s.id=NEW.session_id AND s.event_id=NEW.event_id AND s.capacity IS NOT NULL
   AND (SELECT COUNT(*) FROM event_registrations r
        WHERE r.session_id=s.id AND r.status IN ('submitted','confirmed')) >= s.capacity
 );
END;

CREATE TRIGGER IF NOT EXISTS trg_event_registration_guard_update
BEFORE UPDATE OF event_id,session_id,member_id,status ON event_registrations
WHEN NEW.status IN ('submitted','confirmed','waitlisted')
BEGIN
 SELECT RAISE(ABORT,'registration_identity_required') WHERE NEW.member_id IS NULL OR NEW.session_id IS NULL;
 SELECT RAISE(ABORT,'registration_session_mismatch') WHERE NOT EXISTS (
   SELECT 1 FROM event_sessions s WHERE s.id=NEW.session_id AND s.event_id=NEW.event_id
 );
 SELECT RAISE(ABORT,'registration_session_full') WHERE NEW.status IN ('submitted','confirmed') AND EXISTS (
   SELECT 1 FROM event_sessions s WHERE s.id=NEW.session_id AND s.event_id=NEW.event_id AND s.capacity IS NOT NULL
   AND (SELECT COUNT(*) FROM event_registrations r
        WHERE r.id<>OLD.id AND r.session_id=s.id AND r.status IN ('submitted','confirmed')) >= s.capacity
 );
END;
