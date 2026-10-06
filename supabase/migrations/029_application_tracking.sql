-- Application tracking: jobs found outside the scraper are stored as
-- platform = 'manual' rows, which may have no posting link.
ALTER TABLE jobs ALTER COLUMN url DROP NOT NULL;

ALTER TABLE jobs ADD COLUMN applied_at DATE;
ALTER TABLE jobs ADD COLUMN salary TEXT; -- free text, e.g. "55–60k"

-- Two more statuses for the tracker: rejection and offer.
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('interested', 'applied', 'interview', 'not_interested', 'rejected', 'offer'));

-- Jobs already marked as applied get their best-known date.
UPDATE jobs SET applied_at = created_at::date
WHERE status IN ('applied', 'interview') AND applied_at IS NULL;
