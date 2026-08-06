-- Split profile/settings into three clean concerns: profiles (WHO), a new
-- preferences table (WHAT job you want), and settings (HOW to search).

-- profiles: add personal/professional fields, replace flat skills with categories
ALTER TABLE profiles ADD COLUMN phone TEXT;
ALTER TABLE profiles ADD COLUMN date_of_birth DATE;
ALTER TABLE profiles ADD COLUMN languages JSONB DEFAULT '[]'::jsonb;
ALTER TABLE profiles ADD COLUMN years_of_experience INT;
ALTER TABLE profiles ADD COLUMN "current_role" TEXT;
ALTER TABLE profiles ADD COLUMN skills_frontend JSONB DEFAULT '[]'::jsonb;
ALTER TABLE profiles ADD COLUMN skills_backend JSONB DEFAULT '[]'::jsonb;
ALTER TABLE profiles ADD COLUMN skills_devops JSONB DEFAULT '[]'::jsonb;
ALTER TABLE profiles ADD COLUMN skills_soft JSONB DEFAULT '[]'::jsonb;

UPDATE profiles SET skills_frontend = skills WHERE skills IS NOT NULL;

ALTER TABLE profiles DROP COLUMN skills;
ALTER TABLE profiles DROP COLUMN target_titles;
ALTER TABLE profiles DROP COLUMN target_job_level;

-- preferences: new table for "what job you want", carried forward from settings.ai_*
CREATE TABLE preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'user_1',
  target_titles JSONB DEFAULT '[]'::jsonb,
  preferred_seniority TEXT DEFAULT 'senior',
  preferred_location TEXT,
  job_type JSONB DEFAULT '[]'::jsonb,
  company_size JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

INSERT INTO preferences (user_id, target_titles, preferred_seniority, preferred_location)
SELECT user_id, ai_target_titles, ai_job_level, NULLIF(ai_location_preference, '')
FROM settings;

-- settings: drop AI-matching fields now owned by preferences/profiles
ALTER TABLE settings DROP COLUMN ai_target_titles;
ALTER TABLE settings DROP COLUMN ai_target_skills;
ALTER TABLE settings DROP COLUMN ai_job_level;
ALTER TABLE settings DROP COLUMN ai_location_preference;
