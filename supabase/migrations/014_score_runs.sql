-- Mirrors scrape_runs: lets the frontend poll for progress on a scoring run
-- (which used to be one opaque blocking request with zero visibility and no
-- way to cancel) and supports cooperative cancellation between chunks.
CREATE TABLE IF NOT EXISTS score_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'user_1',
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  total INT DEFAULT 0,
  scored INT DEFAULT 0,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  errors JSONB
);

CREATE INDEX idx_score_runs_user ON score_runs(user_id);
