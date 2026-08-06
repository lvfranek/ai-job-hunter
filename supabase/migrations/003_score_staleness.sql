-- One match per job (needed for upsert on rescore), plus staleness tracking
-- for when preferences change after jobs were already scored.
ALTER TABLE job_matches ADD COLUMN stale_at TIMESTAMP DEFAULT NULL;
ALTER TABLE job_matches ADD CONSTRAINT job_matches_job_id_key UNIQUE (job_id);

CREATE INDEX idx_job_matches_stale ON job_matches(user_id, stale_at);
