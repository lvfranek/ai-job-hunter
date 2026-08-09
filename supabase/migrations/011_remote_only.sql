-- Lets the scraper query for remote-only jobs at the source (Indeed's actor
-- accepts "remote" as a literal location value) instead of scraping everything
-- and filtering afterward — saves Apify credits and scrape time.
ALTER TABLE settings ADD COLUMN remote_only BOOLEAN DEFAULT false;
