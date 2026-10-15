-- What the candidate most wants to work with ("TypeScript, React"): jobs built
-- around something else stay at most Good, so the main focus ranks first.
ALTER TABLE preferences ADD COLUMN focus_skills TEXT DEFAULT '';

-- How a job is worked (remote / hybrid / onsite), as the scorer confirmed it —
-- "remote" only when the posting says so. Feeds the dashboard's workplace filter.
ALTER TABLE job_matches ADD COLUMN work_arrangement TEXT
  CHECK (work_arrangement IN ('remote', 'hybrid', 'onsite'));
