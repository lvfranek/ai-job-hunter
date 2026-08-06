-- Split settings into scraper config (what Apify searches for) vs AI config
-- (what the AI filters/scores by). Fixes scraper being fed narrow AI titles
-- and finding 0 jobs.

ALTER TABLE settings RENAME COLUMN target_titles TO ai_target_titles;
ALTER TABLE settings RENAME COLUMN target_skills TO ai_target_skills;
ALTER TABLE settings RENAME COLUMN job_level TO ai_job_level;
ALTER TABLE settings RENAME COLUMN max_posting_age_days TO scraper_max_posting_age_days;
ALTER TABLE settings RENAME COLUMN results_per_scan TO scraper_results_per_scan;

ALTER TABLE settings ADD COLUMN scraper_search_keywords JSONB DEFAULT '[]'::jsonb;
ALTER TABLE settings ADD COLUMN scraper_location TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN ai_location_preference TEXT DEFAULT '';
