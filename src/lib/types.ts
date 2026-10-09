import type { Chance, Requirement } from "@/lib/chance";

/** Webhook notifications fire for Good+ or for Very good only. */
export type NotificationChance = Extract<Chance, "good" | "very_good">;

// Candidate data for the cover-letter generator only — NOT used by AI scoring.
// The scorer reads Preferences instead.
export interface Profile {
  id: string;
  user_id: string;
  // Personal
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null; // used as the "ZIP City" line in the cover letter header
  street_address: string | null;
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
  // What they're after — read by the AI scorer.
  notes: string; // free text: the ideal job in their own words
  dealbreakers: string; // free text: what they never want — a match makes the job Low
  // Experience — applied in code (scoring-rules.ts), never left to the model.
  experience_years: number | null; // years of RELEVANT professional experience
  target_levels: string[]; // junior | mid | senior; empty = derived from experience_years
  max_required_years: number | null; // jobs requiring more than this are Low
  // Who they are — the AI checks each posting's must-haves against this.
  background: string; // the CV as text: positions, education, projects
  own_skills: string; // free text: skills they're strong in (this or background is required before scoring)
  basic_skills: string; // free text: skills they know the basics of (count as partial)
  education: string;
  certifications: string; // licences and certificates
  spoken_languages: string; // e.g. "German native, English C1"
  // Where and how.
  job_type: string[]; // remote | hybrid | on-site
  // Cities they'd commute to for hybrid or on-site work, each with its own
  // radius. Ignored when only remote is accepted.
  work_locations: WorkLocation[];
  // Contract forms to FILTER OUT (freelance | ausbildung | studium | werkstudent | praktikum).
  // An exclusion list, unlike every other preference here.
  excluded_employment_types: string[];
  work_time_models: string[]; // wanted: vollzeit | teilzeit | minijob
  created_at: string;
  updated_at: string;
}

export interface WorkLocation {
  place: string; // a place name as resolved on save, e.g. "Hamburg", "Wien (AT)"
  radius_km: number;
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
  notification_min_chance: NotificationChance; // lowest tier that triggers a webhook notification
  created_at: string;
  updated_at: string;
}

export interface DbJob {
  id: string;
  user_id: string;
  url: string | null; // null only for manual applications entered without a link
  title: string;
  company: string;
  description: string | null;
  platform: string; // a job board, or MANUAL_PLATFORM for applications added by hand
  status: string | null;
  applied_at: string | null; // YYYY-MM-DD
  salary: string | null;
  posted_date: string | null;
  // Where the job board says the job is — raw, resolved to points when scoring.
  location: string | null;
  postal_code: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  deleted_at: string | null;
}

export interface JobMatch {
  id: string;
  job_id: string;
  user_id: string;
  // Null only on rows scored before the chance tiers (SCORING_VERSION < 2).
  chance: Chance | null;
  // The posting's must-haves and whether the candidate covers each one.
  requirements: Requirement[];
  // Every cap that held the tier down, as short phrases ("Asks 3 yrs, you have 1 – at most Fair").
  downgrades: string[];
  // Nearest of the job's places and its distance from the closest of the
  // candidate's cities; null when the distance rule didn't apply (remote, no data).
  distance_km: number | null;
  work_location: string | null;
  reasoning: string | null;
  // Set only when a hard rule made the job Low ("Hybrid with office days – you
  // only want 100% remote"). Null means a Low tier is just a weak match.
  blocker: string | null;
  stale_at: string | null;
  scoring_version: number; // SCORING_VERSION that produced this row — older means re-score
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
