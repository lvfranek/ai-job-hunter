import type { Preferences, WorkLocation } from "@/lib/types";

// The AI Scoring Preferences: their option lists, defaults, and the one place
// a saved body is cleaned up. Pure module — the preferences page, its API
// route and the scorer all read from here.

/** The CV text box; long enough for a full CV, short enough for every scoring request. */
export const MAX_BACKGROUND_CHARS = 8000;
const MAX_TEXT_CHARS = 2000;
const MAX_YEARS = 50;
export const MAX_WORK_LOCATIONS = 10;
export const DEFAULT_RADIUS_KM = 25;
const MAX_RADIUS_KM = 200;

export const TARGET_LEVELS = ["junior", "mid", "senior"];
export const JOB_TYPES = ["remote", "hybrid", "on-site"];
// German labour-market contract forms. Stored values stay German (existing rows
// use them); the UI shows English labels and the scorer is told both names.
export const EXCLUDABLE_CONTRACTS = [
  "freelance",
  "ausbildung",
  "studium",
  "werkstudent",
  "praktikum",
];
export const WORK_TIME_MODELS = ["vollzeit", "teilzeit", "minijob"];

export type PreferencesInput = Omit<Preferences, "id" | "user_id" | "created_at" | "updated_at">;

export const DEFAULT_PREFERENCES: PreferencesInput = {
  notes: "",
  dealbreakers: "",
  experience_years: null,
  target_levels: [],
  max_required_years: null,
  background: "",
  focus_skills: "",
  own_skills: "",
  basic_skills: "",
  education: "",
  certifications: "",
  spoken_languages: "",
  job_type: [],
  work_locations: [],
  excluded_employment_types: [],
  work_time_models: [],
};

function text(value: unknown, max = MAX_TEXT_CHARS): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function years(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(MAX_YEARS, Math.round(n * 10) / 10);
}

function options(value: unknown, allowed: string[]): string[] {
  if (!Array.isArray(value)) return [];
  return allowed.filter((option) => value.includes(option));
}

function radius(value: unknown): number {
  const n = Math.round(Number(value));
  if (value === "" || value === null || value === undefined || !Number.isFinite(n)) {
    return DEFAULT_RADIUS_KM;
  }
  return Math.min(MAX_RADIUS_KM, Math.max(1, n));
}

/**
 * The commute cities as entered — shape only. Whether a name is a real place is
 * checked by the API route, which has the place data; this module also runs in
 * the browser.
 */
function workLocations(value: unknown): WorkLocation[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: WorkLocation[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const place = text(entry.place, 120);
    if (!place || seen.has(place.toLowerCase())) continue;
    seen.add(place.toLowerCase());
    out.push({ place, radius_km: radius(entry.radius_km) });
    if (out.length === MAX_WORK_LOCATIONS) break;
  }
  return out;
}

/** Whether hybrid or on-site work is on the table — no arrangement ticked means any. */
export function acceptsOfficeWork(jobType: string[] | null | undefined): boolean {
  const types = jobType ?? [];
  return types.length === 0 || types.some((t) => t !== "remote");
}

/**
 * A request body as a clean preferences row: only known fields, numbers parsed
 * ("" → null, 0 stays 0), option lists limited to known values, text trimmed
 * and capped. Unknown keys are dropped — the upsert would fail on them.
 */
export function normalizePreferences(raw: unknown): PreferencesInput {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    notes: text(body.notes),
    dealbreakers: text(body.dealbreakers),
    experience_years: years(body.experience_years),
    target_levels: options(body.target_levels, TARGET_LEVELS),
    max_required_years: years(body.max_required_years),
    background: text(body.background, MAX_BACKGROUND_CHARS),
    focus_skills: text(body.focus_skills, 300),
    own_skills: text(body.own_skills),
    basic_skills: text(body.basic_skills),
    education: text(body.education),
    certifications: text(body.certifications),
    spoken_languages: text(body.spoken_languages),
    job_type: options(body.job_type, JOB_TYPES),
    work_locations: workLocations(body.work_locations),
    excluded_employment_types: options(body.excluded_employment_types, EXCLUDABLE_CONTRACTS),
    work_time_models: options(body.work_time_models, WORK_TIME_MODELS),
  };
}

/**
 * Scoring needs something to check a posting's requirements and tasks against
 * — skills or a CV. Without either, every job would be judged against nothing,
 * and a version bump would re-score every job that way.
 */
export function isReadyForScoring(
  prefs: Pick<Preferences, "own_skills" | "background"> | null,
): boolean {
  return Boolean(prefs?.own_skills?.trim() || prefs?.background?.trim());
}
