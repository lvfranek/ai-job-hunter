-- Replaced by preferences.work_locations (032). Run once the code that reads
-- work_locations is live.
ALTER TABLE preferences DROP COLUMN IF EXISTS preferred_location;
