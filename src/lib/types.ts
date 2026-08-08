export interface Language {
  name: string;
  level: string; // "basic" | "conversational" | "fluent" | "native"
}

export interface Profile {
  id: string;
  user_id: string;
  // Personal
  name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  languages: Language[];
  location: string | null;
  // Professional
  cv_text: string | null;
  current_situation: string | null;
  // Skills (by category)
  skills_frontend: string[];
  skills_backend: string[];
  skills_devops: string[];
  skills_tools: string[];
  created_at: string;
  updated_at: string;
}

export interface Preferences {
  id: string;
  user_id: string;
  target_titles: string[];
  preferred_seniority: number; // 0 (entry level) - 10 (principal/leadership)
  preferred_location: string | null;
  job_type: string[];
  company_size: string[];
  excluded_keywords: string[]; // tech, employer types, etc. the candidate wants to avoid
  match_strictness: number; // 0 (only my exact skills) - 10 (also credit adjacent/related skills)
  created_at: string;
  updated_at: string;
}

export interface Settings {
  id: string;
  user_id: string;
  scraper_search_keywords: string[];
  scraper_location: string;
  scraper_max_posting_age_days: number;
  scraper_results_per_scan: number;
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
  stale_at: string | null;
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

// PostgREST embeds job_matches as a single nullable object, not an array,
// because job_matches.job_id is UNIQUE (one match per job).
export type JobWithMatch = DbJob & {
  job_matches: JobMatch | null;
};
