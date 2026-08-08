-- Full simplification: replace the structured title/skills/strictness/excluded-keywords/
-- company-size fields with one free-text box the AI reads directly. Much easier for the
-- user to express nuance ("open to React or Vue, not interested in gaming studios") than
-- five sliders and six tag lists.
ALTER TABLE preferences ADD COLUMN notes TEXT DEFAULT '';

-- Best-effort backfill from the structured fields being dropped, so existing
-- preferences aren't silently lost.
UPDATE preferences SET notes = CONCAT_WS(E'\n',
  'Target titles: ' || (SELECT string_agg(t, ', ') FROM jsonb_array_elements_text(target_titles) t),
  'Frontend skills: ' || (SELECT string_agg(t, ', ') FROM jsonb_array_elements_text(target_skills_frontend) t),
  'Backend skills: ' || (SELECT string_agg(t, ', ') FROM jsonb_array_elements_text(target_skills_backend) t),
  'Tools: ' || (SELECT string_agg(t, ', ') FROM jsonb_array_elements_text(target_skills_tools) t),
  'Other skills: ' || (SELECT string_agg(t, ', ') FROM jsonb_array_elements_text(target_skills_other) t),
  'Avoid: ' || (SELECT string_agg(t, ', ') FROM jsonb_array_elements_text(excluded_keywords) t)
);

ALTER TABLE preferences DROP COLUMN target_titles;
ALTER TABLE preferences DROP COLUMN title_strictness;
ALTER TABLE preferences DROP COLUMN target_skills_frontend;
ALTER TABLE preferences DROP COLUMN skills_frontend_strictness;
ALTER TABLE preferences DROP COLUMN target_skills_backend;
ALTER TABLE preferences DROP COLUMN skills_backend_strictness;
ALTER TABLE preferences DROP COLUMN target_skills_tools;
ALTER TABLE preferences DROP COLUMN skills_tools_strictness;
ALTER TABLE preferences DROP COLUMN target_skills_other;
ALTER TABLE preferences DROP COLUMN skills_other_strictness;
ALTER TABLE preferences DROP COLUMN excluded_keywords;
ALTER TABLE preferences DROP COLUMN company_size;
