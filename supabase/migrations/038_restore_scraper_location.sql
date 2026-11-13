-- Undoes 037: the scraping settings get their own "Remote only" switch and
-- location back, and a scrape is again one search per board × keyword.
-- Run BEFORE the code that reads remote_only / scraper_location again goes live.

-- The two settings, with the values they had before 037 dropped them.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS remote_only BOOLEAN DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS scraper_location TEXT DEFAULT '';
UPDATE settings SET remote_only = true, scraper_location = 'Germany' WHERE user_id = 'user_1';

-- Search statistics: one row per run × keyword × board again. The per-city rows
-- from the scans in between go; their jobs and keyword links stay.
DELETE FROM scrape_searches WHERE location <> '';
ALTER TABLE scrape_searches
  DROP CONSTRAINT IF EXISTS scrape_searches_run_keyword_portal_location_key;
ALTER TABLE scrape_searches DROP COLUMN IF EXISTS location;
ALTER TABLE scrape_searches
  ADD CONSTRAINT scrape_searches_scrape_run_id_keyword_portal_key
  UNIQUE (scrape_run_id, keyword, portal);

-- Glassdoor was never a board the app scrapes; drop its leftover switch.
UPDATE settings SET portal_toggles = portal_toggles - 'glassdoor'
WHERE portal_toggles ? 'glassdoor';
