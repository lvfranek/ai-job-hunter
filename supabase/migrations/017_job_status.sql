-- Per-job application status. NULL = no status set yet (not a 5th enum value).
ALTER TABLE jobs ADD COLUMN status TEXT
  CHECK (status IN ('interested', 'applied', 'interview', 'not_interested'));
