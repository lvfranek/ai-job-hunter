-- Split the flat skills bag into the same categories a developer actually thinks
-- in (frontend/backend/tools/other), and replace the single page-wide
-- match_strictness with one strictness slider per fuzzy-matched field — a single
-- global strictness didn't make sense when e.g. frontend skills should be strict
-- but title matching can be loose.
ALTER TABLE preferences ADD COLUMN target_skills_frontend JSONB DEFAULT '[]'::jsonb;
ALTER TABLE preferences ADD COLUMN target_skills_backend JSONB DEFAULT '[]'::jsonb;
ALTER TABLE preferences ADD COLUMN target_skills_tools JSONB DEFAULT '[]'::jsonb;
ALTER TABLE preferences ADD COLUMN target_skills_other JSONB DEFAULT '[]'::jsonb;

-- Best-effort backfill: we don't know which category each skill in the old flat
-- list belonged to, so dump it all into "other" — the user re-sorts from there.
UPDATE preferences SET target_skills_other = target_skills WHERE target_skills IS NOT NULL;

ALTER TABLE preferences DROP COLUMN target_skills;

ALTER TABLE preferences ADD COLUMN title_strictness INT DEFAULT 5;
ALTER TABLE preferences ADD COLUMN skills_frontend_strictness INT DEFAULT 5;
ALTER TABLE preferences ADD COLUMN skills_backend_strictness INT DEFAULT 5;
ALTER TABLE preferences ADD COLUMN skills_tools_strictness INT DEFAULT 5;
ALTER TABLE preferences ADD COLUMN skills_other_strictness INT DEFAULT 5;

-- Seed the new sliders from the old single value so behavior doesn't silently reset.
UPDATE preferences SET
  title_strictness = COALESCE(match_strictness, 5),
  skills_frontend_strictness = COALESCE(match_strictness, 5),
  skills_backend_strictness = COALESCE(match_strictness, 5),
  skills_tools_strictness = COALESCE(match_strictness, 5),
  skills_other_strictness = COALESCE(match_strictness, 5);

ALTER TABLE preferences DROP COLUMN match_strictness;
