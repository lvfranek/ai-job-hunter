-- More context for the AI scorer. `notes` alone couldn't express the German
-- labour-market specifics that decide whether a posting is even applicable:
-- contract form (Werkstudent / Ausbildung / Freelance …), working-time model,
-- and the skills the candidate actually has versus what they'd like to use.
--
-- soft_skills_flexible is a scoring instruction, not a fact about the candidate:
-- when on, the scorer treats every soft-skill requirement in a posting
-- (Zuverlässigkeit, Teamfähigkeit, Belastbarkeit …) as fully met.
ALTER TABLE preferences ADD COLUMN employment_types     JSONB   DEFAULT '[]'::jsonb;
ALTER TABLE preferences ADD COLUMN work_time_models     JSONB   DEFAULT '[]'::jsonb;
ALTER TABLE preferences ADD COLUMN own_skills           TEXT    DEFAULT '';
ALTER TABLE preferences ADD COLUMN preferred_languages  TEXT    DEFAULT '';
ALTER TABLE preferences ADD COLUMN soft_skills_flexible BOOLEAN DEFAULT false;
