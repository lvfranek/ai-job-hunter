-- "Soft skills" wasn't a useful signal for matching, drop it
ALTER TABLE profiles DROP COLUMN skills_soft;

-- How liberally the AI should credit skills that aren't an exact match
-- (0 = only count exact skills, 10 = also credit adjacent/related skills)
ALTER TABLE preferences ADD COLUMN match_strictness INT DEFAULT 5;
