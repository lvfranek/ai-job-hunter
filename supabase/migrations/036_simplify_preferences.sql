-- The preferences page now asks only for what scoring really uses: skill chips
-- (own_skills / basic_skills), years, one level, languages, dealbreakers, where
-- and which contracts. Job titles, a CV, a main focus and an "ideal job" text
-- are gone — a job is judged by its requirements and tasks alone.
-- Run once the code that reads level / remote_ok / office_ok is live.

-- One level, picked by hand. Taken from the old picks (highest wins), else
-- from the years the old rules derived it from.
ALTER TABLE preferences ADD COLUMN level TEXT NOT NULL DEFAULT 'mid'
  CHECK (level IN ('junior', 'mid', 'senior'));
UPDATE preferences SET level = CASE
  WHEN COALESCE(target_levels, '[]'::jsonb) ? 'senior' THEN 'senior'
  WHEN COALESCE(target_levels, '[]'::jsonb) ? 'mid' THEN 'mid'
  WHEN COALESCE(target_levels, '[]'::jsonb) ? 'junior' THEN 'junior'
  WHEN experience_years IS NULL THEN 'mid'
  WHEN experience_years < 2 THEN 'junior'
  WHEN experience_years < 5 THEN 'mid'
  ELSE 'senior'
END;

-- Two switches instead of the remote / hybrid / on-site checkboxes. Nothing
-- ticked meant anything goes.
ALTER TABLE preferences ADD COLUMN remote_ok BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE preferences ADD COLUMN office_ok BOOLEAN NOT NULL DEFAULT true;
UPDATE preferences SET
  remote_ok = jsonb_array_length(COALESCE(job_type, '[]'::jsonb)) = 0
    OR job_type ? 'remote',
  office_ok = jsonb_array_length(COALESCE(job_type, '[]'::jsonb)) = 0
    OR job_type ?| ARRAY['hybrid', 'on-site'];

-- Working time is now a plain accept list: an empty one used to mean "any".
UPDATE preferences SET work_time_models = '["vollzeit", "teilzeit", "minijob"]'::jsonb
WHERE jsonb_array_length(COALESCE(work_time_models, '[]'::jsonb)) = 0;

-- Degrees and licences are skill chips now; keep what was entered.
UPDATE preferences SET own_skills = concat_ws(', ',
  NULLIF(TRIM(own_skills), ''),
  NULLIF(TRIM(education), ''),
  NULLIF(TRIM(certifications), '')
);

ALTER TABLE preferences
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS focus_skills,
  DROP COLUMN IF EXISTS background,
  DROP COLUMN IF EXISTS education,
  DROP COLUMN IF EXISTS certifications,
  DROP COLUMN IF EXISTS max_required_years,
  DROP COLUMN IF EXISTS target_levels,
  DROP COLUMN IF EXISTS job_type;
