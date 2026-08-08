-- Preferences must be fully self-contained for AI scoring (skill_overlap_pct needs
-- skills to compare against). It used to borrow skills from profiles, but profiles
-- is candidate data for the (future) cover-letter feature, a separate concern.
ALTER TABLE preferences ADD COLUMN target_skills JSONB DEFAULT '[]'::jsonb;

-- One-time backfill so the user isn't starting from an empty list.
UPDATE preferences p
SET target_skills = COALESCE(pr.skills_frontend, '[]'::jsonb)
  || COALESCE(pr.skills_backend, '[]'::jsonb)
  || COALESCE(pr.skills_devops, '[]'::jsonb)
  || COALESCE(pr.skills_tools, '[]'::jsonb)
FROM profiles pr
WHERE pr.user_id = p.user_id;
