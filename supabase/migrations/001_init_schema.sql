-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'user_1',
  name TEXT,
  email TEXT,
  cv_text TEXT,
  skills JSONB DEFAULT '[]'::jsonb,
  target_titles JSONB DEFAULT '[]'::jsonb,
  target_job_level TEXT,
  location TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'user_1',
  target_titles JSONB DEFAULT '[]'::jsonb,
  target_skills JSONB DEFAULT '[]'::jsonb,
  job_level TEXT DEFAULT 'senior',
  max_posting_age_days INT DEFAULT 30,
  results_per_scan INT DEFAULT 100,
  portal_toggles JSONB DEFAULT '{"indeed": true, "linkedin": true, "xing": true, "stepstone": true, "arbeitsagentur": true}'::jsonb,
  preferred_gemini_model TEXT DEFAULT 'gemini-2.0-flash',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'user_1',
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  description TEXT,
  platform TEXT,
  posted_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_jobs_url ON jobs(url);
CREATE INDEX idx_jobs_user_deleted ON jobs(user_id, deleted_at);
CREATE INDEX idx_jobs_platform_deleted ON jobs(platform, deleted_at);

-- Create job_matches table
CREATE TABLE IF NOT EXISTS job_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT 'user_1',
  match_score INT CHECK (match_score >= 0 AND match_score <= 100),
  skill_overlap_pct INT CHECK (skill_overlap_pct >= 0 AND skill_overlap_pct <= 100),
  seniority_fit INT CHECK (seniority_fit >= 0 AND seniority_fit <= 100),
  location_fit INT CHECK (location_fit >= 0 AND location_fit <= 100),
  reasoning TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_job_matches_job_id ON job_matches(job_id);
CREATE INDEX idx_job_matches_user_score ON job_matches(user_id, match_score DESC);

-- Create scrape_runs table
CREATE TABLE IF NOT EXISTS scrape_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'user_1',
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  total_scraped INT DEFAULT 0,
  passed_prefilter INT DEFAULT 0,
  duplicates_found INT DEFAULT 0,
  scored INT DEFAULT 0,
  errors JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scrape_runs_user_status ON scrape_runs(user_id, status);
