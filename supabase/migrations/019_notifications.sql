-- Minimum score to trigger an outgoing webhook notification (see src/lib/notify.ts).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS notification_threshold INT DEFAULT 75;

-- Prevents re-notifying the same job on a later rescore (rescoring must not reset this).
ALTER TABLE job_matches ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP DEFAULT NULL;
