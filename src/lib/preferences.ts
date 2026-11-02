import type { Preferences, WorkLocation } from "@/lib/types";

// The AI Scoring Preferences: their option lists, defaults, and the one place
// a saved body is cleaned up. Pure module — the preferences page, its API
// route and the scorer all read from here.

const MAX_TEXT_CHARS = 2000;
const MAX_YEARS = 50;
export const MAX_WORK_LOCATIONS = 10;
export const DEFAULT_RADIUS_KM = 25;
const MAX_RADIUS_KM = 200;

export const LEVELS = ["junior", "mid", "senior"];
export const DEFAULT_LEVEL = "mid";
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
  own_skills: "",
  basic_skills: "",
  spoken_languages: "",
  experience_years: null,
  level: DEFAULT_LEVEL,
  dealbreakers: "",
  remote_ok: true,
  office_ok: true,
  work_locations: [],
  excluded_employment_types: [],
  work_time_models: [...WORK_TIME_MODELS],
};

/** A stored skills text as chips: split on commas, semicolons or lines, without duplicates. */
export function toChips(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  const chips: string[] = [];
  for (const part of (text ?? "").split(/[,;\n]+/)) {
    const chip = part.trim();
    if (!chip || seen.has(chip.toLowerCase())) continue;
    seen.add(chip.toLowerCase());
    chips.push(chip);
  }
  return chips;
}

/** Chips back into the stored text. */
export function fromChips(chips: string[]): string {
  return toChips(chips.join(",")).join(", ");
}

function text(value: unknown, max = MAX_TEXT_CHARS): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** A skills field: chips (an array) or text, stored as one clean comma-separated line. */
function skills(value: unknown): string {
  const raw = Array.isArray(value) ? value.filter((v) => typeof v === "string").join(",") : value;
  return text(fromChips(toChips(typeof raw === "string" ? raw : "")));
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

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
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

/**
 * A request body as a clean preferences row: only known fields, numbers parsed
 * ("" → null, 0 stays 0), option lists limited to known values, text trimmed
 * and capped. Unknown keys are dropped — the upsert would fail on them.
 */
export function normalizePreferences(raw: unknown): PreferencesInput {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const level = typeof body.level === "string" && LEVELS.includes(body.level) ? body.level : null;
  return {
    own_skills: skills(body.own_skills),
    basic_skills: skills(body.basic_skills),
    spoken_languages: text(body.spoken_languages),
    experience_years: years(body.experience_years),
    level: level ?? DEFAULT_LEVEL,
    dealbreakers: text(body.dealbreakers),
    remote_ok: flag(body.remote_ok, true),
    office_ok: flag(body.office_ok, true),
    work_locations: workLocations(body.work_locations),
    excluded_employment_types: options(body.excluded_employment_types, EXCLUDABLE_CONTRACTS),
    // Not sent at all: every working time, as for a new profile.
    work_time_models:
      body.work_time_models === undefined
        ? [...WORK_TIME_MODELS]
        : options(body.work_time_models, WORK_TIME_MODELS),
  };
}

/**
 * Scoring needs something to check a posting's requirements and tasks against.
 * Without any strong skills, every job would be judged against nothing, and a
 * version bump would re-score every job that way.
 */
export function isReadyForScoring(prefs: Pick<Preferences, "own_skills"> | null): boolean {
  return Boolean(prefs?.own_skills?.trim());
}
