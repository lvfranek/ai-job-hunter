-- Where to search now comes from the AI Scoring Preferences (remote_ok,
-- office_ok, work_locations): a scan searches all of Germany with the boards'
-- remote filter, plus each preferred city with its radius. The scraping
-- settings' own location and "Remote only" switch are gone.
-- Run once the code that no longer reads them is live.

-- One search per board × keyword × city: remember the city. '' = all of Germany.
ALTER TABLE scrape_searches ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
ALTER TABLE scrape_searches
  DROP CONSTRAINT IF EXISTS scrape_searches_scrape_run_id_keyword_portal_key;
ALTER TABLE scrape_searches
  ADD CONSTRAINT scrape_searches_run_keyword_portal_location_key
  UNIQUE (scrape_run_id, keyword, portal, location);

ALTER TABLE settings
  DROP COLUMN IF EXISTS remote_only,
  DROP COLUMN IF EXISTS scraper_location;
