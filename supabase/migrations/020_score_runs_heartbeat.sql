-- Heartbeat column for score_runs: the scoring pipeline bumps this every time it
-- makes progress. A run that is still 'running' but hasn't touched updated_at in
-- a while is stalled (dead process, hung AI request) — /api/score/status and
-- /api/score use this to fail it instead of leaving the UI polling forever.
ALTER TABLE score_runs ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
