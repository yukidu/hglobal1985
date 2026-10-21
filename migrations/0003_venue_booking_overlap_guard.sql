-- H-Global D1 booking conflict protection (apply only after overlap audit).
-- Store timestamps in one consistent canonical format before enabling.
CREATE TRIGGER IF NOT EXISTS trg_venue_bookings_guard_insert
BEFORE INSERT ON venue_bookings
WHEN NEW.status IN ('pending','approved')
BEGIN
 SELECT RAISE(ABORT, 'invalid_booking_interval') WHERE NEW.starts_at >= NEW.ends_at;
 SELECT RAISE(ABORT, 'slot_venue_mismatch') WHERE NEW.slot_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM venue_slots s WHERE s.id = NEW.slot_id AND s.venue_id = NEW.venue_id
   AND s.status = 'available' AND s.starts_at = NEW.starts_at AND s.ends_at = NEW.ends_at
 );
 SELECT RAISE(ABORT, 'venue_time_conflict') WHERE EXISTS (
  SELECT 1 FROM venue_bookings b WHERE b.venue_id = NEW.venue_id
   AND b.status IN ('pending','approved') AND b.starts_at < NEW.ends_at AND NEW.starts_at < b.ends_at
 );
END;

CREATE TRIGGER IF NOT EXISTS trg_venue_bookings_guard_update
BEFORE UPDATE OF venue_id, slot_id, status, starts_at, ends_at ON venue_bookings
WHEN NEW.status IN ('pending','approved')
BEGIN
 SELECT RAISE(ABORT, 'invalid_booking_interval') WHERE NEW.starts_at >= NEW.ends_at;
 SELECT RAISE(ABORT, 'slot_venue_mismatch') WHERE NEW.slot_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM venue_slots s WHERE s.id = NEW.slot_id AND s.venue_id = NEW.venue_id
   AND s.status = 'available' AND s.starts_at = NEW.starts_at AND s.ends_at = NEW.ends_at
 );
 SELECT RAISE(ABORT, 'venue_time_conflict') WHERE EXISTS (
  SELECT 1 FROM venue_bookings b WHERE b.id <> OLD.id AND b.venue_id = NEW.venue_id
   AND b.status IN ('pending','approved') AND b.starts_at < NEW.ends_at AND NEW.starts_at < b.ends_at
 );
END;
