-- Per-run progress for a scrape. One "Scrape Now" now fans out to one Apify run
-- per active board × per keyword (up to 25), so the UI needs a "board N of M"
-- counter, and a heartbeat (updated_at) so a dead worker can be reaped instead
-- of leaving the run stuck at 'running' forever. Mirrors score_runs.updated_at
-- (migration 020).
ALTER TABLE scrape_runs ADD COLUMN total_runs INT DEFAULT 0;
ALTER TABLE scrape_runs ADD COLUMN completed_runs INT DEFAULT 0;
ALTER TABLE scrape_runs ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
