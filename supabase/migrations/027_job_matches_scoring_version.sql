-- Which version of the scoring logic produced a match (SCORING_VERSION in
-- src/lib/scoring-rules.ts). Matches from an older version are re-scored on the
-- next run, so a fix to the scorer reaches jobs that were already scored instead
-- of only newly scraped ones. Existing rows start at 0 = "before versioning".
ALTER TABLE job_matches ADD COLUMN scoring_version INT NOT NULL DEFAULT 0;
