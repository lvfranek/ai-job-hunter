-- Per-portal breakdown of how many jobs each job board actually returned in a
-- scrape run (e.g. {"indeed": 12, "linkedin": 4}), shown to the user once the run finishes.
ALTER TABLE scrape_runs ADD COLUMN portal_counts JSONB DEFAULT '{}'::jsonb;
