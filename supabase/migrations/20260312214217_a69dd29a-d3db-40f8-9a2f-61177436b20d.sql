-- Backfill missing client_id in sms_logs by matching phone_number
UPDATE sms_logs sl
SET client_id = c.id
FROM clients c
WHERE sl.client_id IS NULL
  AND c.phone_number = sl.phone_number
  AND c.deleted_at IS NULL;