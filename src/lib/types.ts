export interface Profile {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  cv_text: string | null;
  skills: string[];
  target_titles: string[];
  target_job_level: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  id: string;
  user_id: string;
  target_titles: string[];
  target_skills: string[];
  job_level: string;
  max_posting_age_days: number;
  results_per_scan: number;
  portal_toggles: Record<string, boolean>;
  preferred_gemini_model: string;
  created_at: string;
  updated_at: string;
}

export interface DbJob {
  id: string;
  user_id: string;
  url: string;
  title: string;
  company: string;
  description: string | null;
  platform: string;
  posted_date: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface JobMatch {
  id: string;
  job_id: string;
  user_id: string;
  match_score: number;
  skill_overlap_pct: number;
  seniority_fit: number;
  location_fit: number;
  reasoning: string | null;
  created_at: string;
}

export interface ScrapeRun {
  id: string;
  user_id: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  ended_at: string | null;
  total_scraped: number;
  passed_prefilter: number;
  duplicates_found: number;
  scored: number;
  errors: Record<string, string> | null;
  created_at: string;
}

export type JobWithMatch = DbJob & {
  job_matches: JobMatch[];
};
