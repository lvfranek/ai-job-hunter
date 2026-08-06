-- Seniority as a 0-10 feel-based scale instead of fixed labels
ALTER TABLE preferences ALTER COLUMN preferred_seniority DROP DEFAULT;
ALTER TABLE preferences ALTER COLUMN preferred_seniority TYPE INT USING (
  CASE preferred_seniority
    WHEN 'junior' THEN 2
    WHEN 'mid' THEN 4
    WHEN 'senior' THEN 7
    WHEN 'lead' THEN 9
    WHEN 'principal' THEN 10
    ELSE 5
  END
);
ALTER TABLE preferences ALTER COLUMN preferred_seniority SET DEFAULT 5;

-- Things the candidate explicitly doesn't want (tech, employer type, etc.)
ALTER TABLE preferences ADD COLUMN excluded_keywords JSONB DEFAULT '[]'::jsonb;

-- Replace current_role/years_of_experience with a free-text "current situation"
-- (covers unemployed/studying/etc., which a role+years pair can't express)
ALTER TABLE profiles DROP COLUMN "current_role";
ALTER TABLE profiles DROP COLUMN years_of_experience;
ALTER TABLE profiles ADD COLUMN current_situation TEXT;

-- Catch-all skills bucket for anything that isn't frontend/backend/devops/soft
ALTER TABLE profiles ADD COLUMN skills_tools JSONB DEFAULT '[]'::jsonb;

-- languages moves from string[] to {name, level}[]; reshape any existing plain strings
UPDATE profiles
SET languages = (
  SELECT jsonb_agg(jsonb_build_object('name', elem, 'level', 'fluent'))
  FROM jsonb_array_elements_text(languages) elem
)
WHERE jsonb_typeof(languages) = 'array'
  AND jsonb_array_length(languages) > 0
  AND jsonb_typeof(languages -> 0) = 'string';
