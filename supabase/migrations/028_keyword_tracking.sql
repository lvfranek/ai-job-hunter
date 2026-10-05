-- Keyword tracking for the Statistics page. A scrape fans out to one search per
-- board × keyword, but until now the results were merged and deduplicated by URL,
-- so nothing remembered which keyword found a job. These two tables keep that,
-- for good — they outlive keyword rotation and pruning (pruning only soft-deletes).

-- Which search keyword(s) found each job. A job found by several keywords gets
-- one row per keyword; the first sighting wins (rows are never updated).
-- `keyword` is normalized: trimmed, lower-case, single spaces.
CREATE TABLE IF NOT EXISTS job_keywords (
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'user_1',
  scrape_run_id UUID REFERENCES scrape_runs(id) ON DELETE SET NULL,
  -- true when this keyword's search is what first brought the job into the DB
  discovered BOOLEAN NOT NULL DEFAULT false,
  first_seen_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (job_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_job_keywords_user_keyword ON job_keywords(user_id, keyword);

-- One row per board × keyword search in a scrape run: how much it returned, how
-- much of that was new, and whether it failed.
CREATE TABLE IF NOT EXISTS scrape_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_run_id UUID NOT NULL REFERENCES scrape_runs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT 'user_1',
  keyword TEXT NOT NULL,
  portal TEXT NOT NULL,
  returned INT NOT NULL DEFAULT 0, -- listings the board returned for this search
  new_jobs INT NOT NULL DEFAULT 0, -- of those, jobs that were new to the DB
  result_cap INT, -- scraper_results_per_scan at the time; returned >= cap means "there was more"
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (scrape_run_id, keyword, portal)
);

CREATE INDEX IF NOT EXISTS idx_scrape_searches_user_keyword ON scrape_searches(user_id, keyword);

-- Same policy shape as every other table (015/016): the single app user only.
ALTER TABLE job_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_keywords_select_user_1 ON job_keywords FOR SELECT USING (user_id = 'user_1');
CREATE POLICY job_keywords_insert_user_1 ON job_keywords FOR INSERT WITH CHECK (user_id = 'user_1');
CREATE POLICY job_keywords_update_user_1 ON job_keywords FOR UPDATE USING (user_id = 'user_1') WITH CHECK (user_id = 'user_1');
CREATE POLICY job_keywords_delete_user_1 ON job_keywords FOR DELETE USING (user_id = 'user_1');

CREATE POLICY scrape_searches_select_user_1 ON scrape_searches FOR SELECT USING (user_id = 'user_1');
CREATE POLICY scrape_searches_insert_user_1 ON scrape_searches FOR INSERT WITH CHECK (user_id = 'user_1');
CREATE POLICY scrape_searches_update_user_1 ON scrape_searches FOR UPDATE USING (user_id = 'user_1') WITH CHECK (user_id = 'user_1');
CREATE POLICY scrape_searches_delete_user_1 ON scrape_searches FOR DELETE USING (user_id = 'user_1');
