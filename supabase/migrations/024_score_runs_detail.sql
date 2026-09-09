-- Live detail for a scoring run. `scored`/`total` alone couldn't answer "is it
-- actually progressing, and is it losing jobs?" — the old pipeline counted a
-- failed chunk as scored, so the counter reached 100% while jobs stayed
-- unscored. `failed` is now tracked separately and `total_chunks`/
-- `completed_chunks` expose the real unit of work. `model` surfaces which
-- OpenRouter model ran, so a misconfigured slug is visible immediately.
ALTER TABLE score_runs ADD COLUMN total_chunks     INT DEFAULT 0;
ALTER TABLE score_runs ADD COLUMN completed_chunks INT DEFAULT 0;
ALTER TABLE score_runs ADD COLUMN failed           INT DEFAULT 0;
ALTER TABLE score_runs ADD COLUMN model            TEXT;
