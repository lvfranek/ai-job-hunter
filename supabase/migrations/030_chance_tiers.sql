-- Chance tiers instead of a 0-100 match score. The model drifted between runs
-- and rated a posting asking for four years a 95 for a candidate with one. Now
-- the model only reports a checklist of the posting's must-haves, and code
-- (src/lib/scoring-rules.ts) turns it into one of four tiers.
--
-- Ship together with the code: the previous version reads match_score.

-- ---- job_matches -------------------------------------------------------------

-- The tier, the requirement checklist it was computed from
-- ([{text, kind, status}]), and every cap that held it down (string[]).
-- chance stays NULL on old rows until they're re-scored — SCORING_VERSION 2
-- marks every one of them outdated.
ALTER TABLE job_matches ADD COLUMN chance TEXT
  CHECK (chance IN ('low', 'fair', 'good', 'very_good'));
ALTER TABLE job_matches ADD COLUMN requirements JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE job_matches ADD COLUMN downgrades JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Re-scoring keeps notified_at, so without this the first scored run after the
-- switch would send a webhook for every old job that now reaches the tier.
UPDATE job_matches SET notified_at = COALESCE(notified_at, NOW());

DROP INDEX IF EXISTS idx_job_matches_user_score;
ALTER TABLE job_matches DROP COLUMN IF EXISTS match_score;
ALTER TABLE job_matches DROP COLUMN IF EXISTS skill_overlap_pct;
ALTER TABLE job_matches DROP COLUMN IF EXISTS seniority_fit;
ALTER TABLE job_matches DROP COLUMN IF EXISTS location_fit;
ALTER TABLE job_matches DROP COLUMN IF EXISTS employment_fit;

-- ---- preferences -------------------------------------------------------------

-- A profile that works for any profession, not just software: target roles,
-- experience as numbers the rules can apply, and the whole CV as text.
ALTER TABLE preferences ADD COLUMN target_roles       TEXT  DEFAULT '';
ALTER TABLE preferences ADD COLUMN dealbreakers       TEXT  DEFAULT '';
ALTER TABLE preferences ADD COLUMN experience_years   NUMERIC(4, 1);
ALTER TABLE preferences ADD COLUMN target_levels      JSONB DEFAULT '[]'::jsonb;
ALTER TABLE preferences ADD COLUMN max_required_years NUMERIC(4, 1);
ALTER TABLE preferences ADD COLUMN background         TEXT  DEFAULT '';
ALTER TABLE preferences ADD COLUMN basic_skills       TEXT  DEFAULT '';
ALTER TABLE preferences ADD COLUMN education          TEXT  DEFAULT '';
ALTER TABLE preferences ADD COLUMN certifications     TEXT  DEFAULT '';
ALTER TABLE preferences ADD COLUMN spoken_languages   TEXT  DEFAULT '';

-- preferred_languages goes away; keep what was in it as part of the notes.
UPDATE preferences
SET notes = CONCAT_WS(
  E'\n\n',
  NULLIF(TRIM(notes), ''),
  'Preferred programming languages: ' || TRIM(preferred_languages)
)
WHERE NULLIF(TRIM(preferred_languages), '') IS NOT NULL;

-- Soft skills never enter the requirement checklist, so the "flexible" switch
-- has nothing left to switch. preferred_seniority has been unused since 009.
ALTER TABLE preferences DROP COLUMN IF EXISTS preferred_languages;
ALTER TABLE preferences DROP COLUMN IF EXISTS soft_skills_flexible;
ALTER TABLE preferences DROP COLUMN IF EXISTS preferred_seniority;

-- ---- settings ----------------------------------------------------------------

-- Webhook threshold as a tier. 85+ was "only near-perfect matches"; anything
-- lower (default 75, "clear match, one small gap") is Good or better.
ALTER TABLE settings ADD COLUMN notification_min_chance TEXT NOT NULL DEFAULT 'good'
  CHECK (notification_min_chance IN ('good', 'very_good'));
UPDATE settings
SET notification_min_chance = CASE WHEN notification_threshold >= 85 THEN 'very_good' ELSE 'good' END
WHERE notification_threshold IS NOT NULL;
ALTER TABLE settings DROP COLUMN IF EXISTS notification_threshold;
