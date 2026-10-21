-- 0006: Transactional in-app notification producer for event/venue lifecycle.
-- No outbound email, LINE messages or Web Push is sent by this migration.
CREATE TRIGGER IF NOT EXISTS trg_event_registration_notice_created
AFTER INSERT ON event_registrations
WHEN NEW.member_id IS NOT NULL
BEGIN
 INSERT INTO notifications(id,member_id,category,title,body)
 VALUES (lower(hex(randomblob(16))),NEW.member_id,'events',
   '活動報名申請已建立',
   (SELECT '活動：'||title FROM events WHERE id=NEW.event_id));
END;

CREATE TRIGGER IF NOT EXISTS trg_event_registration_notice_status
AFTER UPDATE OF status ON event_registrations
WHEN OLD.status<>NEW.status AND NEW.member_id IS NOT NULL
BEGIN
 INSERT INTO notifications(id,member_id,category,title,body)
 VALUES (lower(hex(randomblob(16))),NEW.member_id,'events',
   CASE NEW.status
     WHEN 'confirmed' THEN '活動報名已確認'
     WHEN 'cancelled' THEN '活動報名已取消'
     WHEN 'waitlisted' THEN '活動報名已候補'
     WHEN 'rejected' THEN '活動報名未獲核准'
     ELSE '活動報名狀態已更新' END,
   (SELECT '活動：'||title FROM events WHERE id=NEW.event_id));
END;

CREATE TRIGGER IF NOT EXISTS trg_venue_booking_notice_created
AFTER INSERT ON venue_bookings
WHEN NEW.member_id IS NOT NULL
BEGIN
 INSERT INTO notifications(id,member_id,category,title,body)
 VALUES (lower(hex(randomblob(16))),NEW.member_id,'venues',
   '場地預約申請已建立',
   (SELECT '場地：'||name FROM venues WHERE id=NEW.venue_id));
END;

CREATE TRIGGER IF NOT EXISTS trg_venue_booking_notice_status
AFTER UPDATE OF status ON venue_bookings
WHEN OLD.status<>NEW.status AND NEW.member_id IS NOT NULL
BEGIN
 INSERT INTO notifications(id,member_id,category,title,body)
 VALUES (lower(hex(randomblob(16))),NEW.member_id,'venues',
   CASE NEW.status
     WHEN 'approved' THEN '場地預約已核准'
     WHEN 'cancelled' THEN '場地預約已取消'
     WHEN 'rejected' THEN '場地預約未獲核准'
     ELSE '場地預約狀態已更新' END,
   (SELECT '場地：'||name FROM venues WHERE id=NEW.venue_id));
END;
