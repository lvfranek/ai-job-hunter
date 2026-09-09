export interface Language {
  name: string;
  level: string; // "basic" | "conversational" | "fluent" | "native"
}

// Candidate data for the cover-letter generator only — NOT used by AI scoring.
// Preferences.notes is the scoring agent's free-text input instead.
export interface Profile {
  id: string;
  user_id: string;
  // Personal
  name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  languages: Language[];
  location: string | null; // used as the "ZIP City" line in the cover letter header
  street_address: string | null;
  // Professional
  cv_text: string | null;
  current_situation: string | null;
  // Skills (by category)
  skills_frontend: string[];
  skills_backend: string[];
  skills_devops: string[];
  skills_tools: string[];
  // Cover letter content
  personal_story: string | null; // opening hook, adapted per job by the AI
  key_achievements: string[]; // AI picks the most relevant ones per job
  motivation: string | null;
  created_at: string;
  updated_at: string;
}

export interface Preferences {
  id: string;
  user_id: string;
  notes: string; // free text: what the candidate wants and doesn't want, read directly by the AI scorer
  preferred_location: string | null;
  job_type: string[]; // remote | hybrid | on-site
  // Contract forms to FILTER OUT (freelance | ausbildung | studium | werkstudent).
  // An exclusion list, unlike every other preference here.
  excluded_employment_types: string[];
  work_time_models: string[]; // wanted: vollzeit | teilzeit | minijob
  own_skills: string; // free text: skills the candidate actually has
  preferred_languages: string; // free text: programming languages they'd rather work in
  // Scoring instruction, not a fact about the candidate: when true the scorer
  // treats every soft-skill requirement in a posting as fully met.
  soft_skills_flexible: boolean;
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
  remote_only: boolean; // query the scraper for remote-only jobs at the source, where supported
  portal_toggles: Record<string, boolean>;
  notification_threshold: number; // min match_score (0-100) to trigger a webhook notification
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
  status: string | null;
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
  employment_fit: number;
  reasoning: string | null;
  // Set only when the job scored low for a nameable hard reason ("Standort
  // Zürich, kein Remote"). Null means "no blocker — a low score here is just
  // a weak match, not an impossibility".
  blocker: string | null;
  stale_at: string | null;
  notified_at: string | null;
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
  portal_counts: Record<string, number>;
  errors: Record<string, string> | null;
  created_at: string;
}

export interface ScoreRun {
  id: string;
  user_id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  total: number;
  scored: number; // jobs that actually got a match row
  failed: number; // jobs the run could not score — they stay "needs scoring"
  total_chunks: number;
  completed_chunks: number;
  model: string | null; // which OpenRouter model ran, for the live detail line
  started_at: string;
  ended_at: string | null;
  errors: Record<string, string> | null;
}

// PostgREST embeds job_matches as a single nullable object, not an array,
// because job_matches.job_id is UNIQUE (one match per job).
export type JobWithMatch = DbJob & {
  job_matches: JobMatch | null;
};
