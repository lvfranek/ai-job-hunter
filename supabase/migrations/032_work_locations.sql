-- Where a job is, and where the candidate wants to work. Additive only, so the
-- previous code keeps running until the new one is deployed; 033 drops the old
-- free-text preferred_location afterwards.

-- Raw location fields from the job boards. Distances are computed from them on
-- the server (src/lib/geo), so only what the boards say is stored here.
ALTER TABLE jobs ADD COLUMN location     TEXT;
ALTER TABLE jobs ADD COLUMN postal_code  TEXT;
ALTER TABLE jobs ADD COLUMN country_code TEXT;
ALTER TABLE jobs ADD COLUMN latitude     DOUBLE PRECISION;
ALTER TABLE jobs ADD COLUMN longitude    DOUBLE PRECISION;

-- The cities the candidate would commute to, each with its own radius:
-- [{"place": "Hamburg", "radius_km": 10}, …]. Only used when hybrid or on-site
-- work is accepted.
ALTER TABLE preferences ADD COLUMN work_locations JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Carry an existing free-text location over with a 25 km radius. It is
-- resolved when scoring and replaced by its proper place name on the next save.
UPDATE preferences
SET work_locations = jsonb_build_array(
  jsonb_build_object('place', TRIM(preferred_location), 'radius_km', 25)
)
WHERE NULLIF(TRIM(preferred_location), '') IS NOT NULL;

-- The nearest of the job's places and how far it is from the closest of the
-- candidate's cities, for the job card ("Norderstedt · 4 km").
ALTER TABLE job_matches ADD COLUMN distance_km   INT;
ALTER TABLE job_matches ADD COLUMN work_location TEXT;
