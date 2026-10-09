// The chance tier is decided here, not by the model. Asked for a number, the
// model drifted between runs and talked itself into a 95 for a posting that
// wants four years when the candidate has one. So the model only reports
// facts about the posting plus a checklist of its must-haves, and this file
// turns those into a tier — deterministically, with every reason spelled out.
//
// Pure module, no server imports: the dashboard imports SCORING_VERSION.

import {
  lowerChance,
  REQUIREMENT_KINDS,
  REQUIREMENT_STATUSES,
  type Chance,
  type Requirement,
  type RequirementKind,
  type RequirementStatus,
} from "@/lib/chance";
import { closestKm, type Home, type PlacePoints } from "@/lib/geo/distance";
import type { Preferences } from "@/lib/types";

/**
 * Version of the scoring logic (prompt + these rules). Every match row stores
 * the version that produced it, and rows from an older version are re-scored on
 * the next run — otherwise a fix here would only ever reach newly scraped jobs.
 * Bump it whenever a change should re-score existing jobs.
 */
export const SCORING_VERSION = 5;

export type WorkArrangement = "remote" | "hybrid" | "onsite";
export type PostingLevel = "junior" | "mid" | "senior";
/** Contract forms the candidate can exclude; "regular" is ordinary employment. */
export type ContractForm =
  "regular" | "werkstudent" | "ausbildung" | "studium" | "freelance" | "praktikum";
/** The contract forms the preferences page can exclude. */
export type ExcludableContract = Exclude<ContractForm, "regular">;
export type WorkTime = "fulltime" | "parttime" | "both" | "minijob";
/** How the posting's day-to-day tasks relate to what the candidate has done and wants to do. */
export type TaskFit = "same" | "adjacent" | "different";

/** What the model read out of one posting — facts only, no judgement about the candidate. */
export interface PostingFacts {
  title: string;
  level: PostingLevel | null;
  /** Minimum MANDATORY years of experience, null when the posting names none. */
  requiredYears: number | null;
  /** null when the posting says nothing about where the work happens. */
  arrangement: WorkArrangement | null;
  /** Core programming languages; one entry may list alternatives ("Java or Kotlin"). */
  coreLanguages: string[];
  contractForm: ContractForm | null;
  workTime: WorkTime | null;
  taskFit: TaskFit | null;
  requirements: Requirement[];
  /** The candidate's dealbreaker this posting hits, in the model's words. */
  dealbreaker: string | null;
  /** Length of the stored description — a near-empty posting can't prove a fit. */
  descriptionChars: number;
  /** Cities the model read as where the job is worked from — a fallback for the board's location. */
  workLocations: string[];
  /** Where the job is, resolved on the server (geo/places.ts); [] when unknown. */
  places: PlacePoints[];
}

export interface ChanceResult {
  job_id: string;
  chance: Chance;
  requirements: Requirement[];
  downgrades: string[];
  distance_km: number | null;
  work_location: string | null;
  blocker: string | null;
  reasoning: string;
}

// ---- reading the model's facts ----------------------------------------------

const ARRANGEMENTS: WorkArrangement[] = ["remote", "hybrid", "onsite"];
const LEVELS: PostingLevel[] = ["junior", "mid", "senior"];
const CONTRACT_FORMS: ContractForm[] = [
  "regular",
  "werkstudent",
  "ausbildung",
  "studium",
  "freelance",
  "praktikum",
];
const WORK_TIMES: WorkTime[] = ["fulltime", "parttime", "both", "minijob"];
export const TASK_FITS: TaskFit[] = ["same", "adjacent", "different"];

// Synonyms the model reaches for despite the prompt.
const LEVEL_ALIASES: Record<string, PostingLevel> = { entry: "junior", lead: "senior" };

function pick<T extends string>(value: unknown, allowed: T[]): T | null {
  const text = String(value ?? "")
    .toLowerCase()
    .trim();
  return allowed.includes(text as T) ? (text as T) : null;
}

function textOrNull(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.toLowerCase() !== "null" ? text : null;
}

export const MAX_REQUIREMENTS = 8;
const MAX_REQUIREMENT_CHARS = 60;

// Years of experience are judged from required_years by the experience rule;
// listing them again would count the same gap twice.
const YEARS_REQUIREMENT =
  /\d\s*\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?|jahre?n?)\b|mehrjährig|langjährig|several years|many years/i;

/**
 * Clean up the model's checklist: drop entries without a valid status and
 * entries that are really an experience-years requirement, collapse
 * duplicates, and keep the first MAX_REQUIREMENTS in posting order.
 */
export function normalizeRequirements(raw: unknown): Requirement[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const requirements: Requirement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const text = textOrNull(entry.text)?.replace(/\s+/g, " ");
    const status = pick<RequirementStatus>(entry.status, REQUIREMENT_STATUSES);
    if (!text || !status || YEARS_REQUIREMENT.test(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    requirements.push({
      text:
        text.length > MAX_REQUIREMENT_CHARS ? `${text.slice(0, MAX_REQUIREMENT_CHARS - 1)}…` : text,
      kind: pick<RequirementKind>(entry.kind, REQUIREMENT_KINDS) ?? "skill",
      status,
    });
    if (requirements.length === MAX_REQUIREMENTS) break;
  }
  return requirements;
}

export function readPostingFacts(
  entry: Record<string, unknown>,
  job: { title: string; description: string | null },
): PostingFacts {
  const years = Number(entry.required_years);
  const rawLevel = String(entry.posting_level ?? "")
    .toLowerCase()
    .trim();
  return {
    title: job.title,
    level: pick(rawLevel, LEVELS) ?? LEVEL_ALIASES[rawLevel] ?? null,
    requiredYears:
      entry.required_years != null && Number.isFinite(years) && years > 0 ? years : null,
    arrangement: pick(entry.work_arrangement, ARRANGEMENTS),
    coreLanguages: Array.isArray(entry.core_languages)
      ? entry.core_languages.filter((l): l is string => typeof l === "string" && l.trim() !== "")
      : [],
    contractForm: pick(entry.contract_form, CONTRACT_FORMS),
    workTime: pick(entry.work_time, WORK_TIMES),
    taskFit: pick(entry.task_fit, TASK_FITS),
    requirements: normalizeRequirements(entry.requirements),
    dealbreaker: textOrNull(entry.dealbreaker),
    descriptionChars: job.description?.trim().length ?? 0,
    workLocations: Array.isArray(entry.work_locations)
      ? entry.work_locations
          .filter((l): l is string => typeof l === "string" && l.trim() !== "")
          .slice(0, 5)
      : [],
    places: [],
  };
}

// ---- the candidate ------------------------------------------------------------

export type CandidatePreferences = Pick<
  Preferences,
  | "job_type"
  | "excluded_employment_types"
  | "work_time_models"
  | "experience_years"
  | "target_levels"
  | "max_required_years"
  | "dealbreakers"
  | "own_skills"
  | "basic_skills"
>;

/** The preferences, reduced to what the rules compare against. */
export interface Candidate {
  /** Empty = every arrangement is fine. */
  arrangements: WorkArrangement[];
  excludedContracts: ExcludableContract[];
  /** vollzeit | teilzeit | minijob; empty = every working time is fine. */
  workTimes: string[];
  experienceYears: number | null;
  maxRequiredYears: number | null;
  /** Empty = no level rules at all (no levels picked, no experience given). */
  targetLevels: PostingLevel[];
  /** True when targetLevels came from experienceYears rather than the candidate's own pick. */
  levelsDerived: boolean;
  hasDealbreakers: boolean;
  /** Programming languages named anywhere in their skills. */
  languages: Set<string>;
  /** Cities they'd commute to; empty when only remote is accepted or none were given. */
  homes: Home[];
}

function yearsOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const years = Number(value);
  return Number.isFinite(years) && years >= 0 ? years : null;
}

/**
 * Levels for a candidate who picked none: someone with a year of experience
 * isn't looking at senior roles even if they never said so — leaving it open is
 * exactly how a "4 years, Senior-Level" posting used to reach the top.
 */
function levelsFromExperience(years: number | null): PostingLevel[] {
  if (years === null) return [];
  if (years < 2) return ["junior"];
  if (years < 5) return ["junior", "mid"];
  return ["junior", "mid", "senior"];
}

/** `homes` are the candidate's cities, already resolved to points on the server. */
export function toCandidate(prefs: CandidatePreferences, homes: Home[] = []): Candidate {
  const experienceYears = yearsOrNull(prefs.experience_years);
  const picked = (prefs.target_levels ?? []).filter((l): l is PostingLevel =>
    LEVELS.includes(l as PostingLevel),
  );
  // The preferences page stores "on-site"; the scorer says "onsite".
  const arrangements = (prefs.job_type ?? [])
    .map((t) => (t === "on-site" ? "onsite" : t))
    .filter((t): t is WorkArrangement => ARRANGEMENTS.includes(t as WorkArrangement));
  const officeAccepted = arrangements.length === 0 || arrangements.some((a) => a !== "remote");
  return {
    arrangements,
    excludedContracts: (prefs.excluded_employment_types ?? []).filter(
      (c): c is ExcludableContract => c in CONTRACT_IN_TITLE,
    ),
    workTimes: prefs.work_time_models ?? [],
    experienceYears,
    maxRequiredYears: yearsOrNull(prefs.max_required_years),
    targetLevels: picked.length > 0 ? picked : levelsFromExperience(experienceYears),
    levelsDerived: picked.length === 0,
    hasDealbreakers: Boolean(prefs.dealbreakers?.trim()),
    languages: candidateLanguages(prefs.own_skills, prefs.basic_skills),
    homes: officeAccepted ? homes : [],
  };
}

// ---- programming languages ----------------------------------------------------

// Everything a posting or a skills list might name, mapped to the language it
// stands for. Frameworks count as their language, so "Spring Boot" in a posting
// and "Django" in a skills list both land somewhere comparable. TypeScript and
// JavaScript share one entry: whoever writes one can work in the other.
const LANGUAGE_ALIASES: Record<string, string> = {
  java: "java",
  spring: "java",
  springboot: "java",
  jakartaee: "java",
  j2ee: "java",
  jee: "java",
  kotlin: "kotlin",
  scala: "scala",
  "c#": "c#",
  csharp: "c#",
  ".net": "c#",
  dotnet: "c#",
  "asp.net": "c#",
  "c++": "c++",
  cpp: "c++",
  c: "c",
  go: "go",
  golang: "go",
  rust: "rust",
  php: "php",
  laravel: "php",
  symfony: "php",
  ruby: "ruby",
  rails: "ruby",
  rubyonrails: "ruby",
  python: "python",
  django: "python",
  flask: "python",
  fastapi: "python",
  javascript: "javascript",
  js: "javascript",
  typescript: "javascript",
  ts: "javascript",
  node: "javascript",
  nodejs: "javascript",
  "node.js": "javascript",
  react: "javascript",
  reactnative: "javascript",
  "next.js": "javascript",
  nextjs: "javascript",
  angular: "javascript",
  vue: "javascript",
  "vue.js": "javascript",
  nuxt: "javascript",
  swift: "swift",
  "objective-c": "objective-c",
  dart: "dart",
  flutter: "dart",
  elixir: "elixir",
  abap: "abap",
  cobol: "cobol",
  delphi: "delphi",
  vba: "vba",
};

function toLanguage(name: string): string | null {
  return LANGUAGE_ALIASES[name.toLowerCase().replace(/\s+/g, "")] ?? null;
}

/** The languages a free-text skills list covers ("React, Python, Git, …"). */
export function candidateLanguages(...skillTexts: (string | null | undefined)[]): Set<string> {
  const languages = new Set<string>();
  for (const text of skillTexts) {
    for (const part of (text ?? "").split(/[,;\n/()]+/)) {
      const language = toLanguage(part.trim());
      if (language) languages.add(language);
    }
  }
  return languages;
}

/**
 * Core language requirements the candidate can't meet. An entry with
 * alternatives ("Java or Python"; German "oder" works too) is met by any one of them. Names the model
 * returns that aren't programming languages (SQL, HTML, "Cloud") are ignored.
 */
export function missingCoreLanguages(core: string[], candidate: Set<string>): string[] {
  const missing = new Map<string, string>(); // canonical language -> name as written
  for (const requirement of core) {
    const options = requirement
      .split(/\s+(?:oder|or)\s+|\s*[|/,]\s*/i)
      .map((option) => option.trim())
      .filter((option) => toLanguage(option) !== null);
    if (options.length === 0 || options.some((o) => candidate.has(toLanguage(o)!))) continue;
    const key = options.map((o) => toLanguage(o)).join("|");
    if (!missing.has(key)) missing.set(key, options.join(" or "));
  }
  return [...missing.values()];
}

// Too ambiguous to read out of a title ("Go-Live", "C-Level").
const NOT_IN_TITLES = new Set(["go", "c"]);

/**
 * The languages a job title names, as one requirement whose alternatives are
 * all of them — "Java Fullstack Developer" needs Java, "Frontend Developer
 * Angular / React" is met by either. A backstop for when the model leaves the
 * title's language out of core_languages.
 */
export function titleLanguageRequirement(title: string): string | null {
  const named = title.split(/[\s,/&()|]+/).filter((word) => {
    const language = toLanguage(word);
    return language !== null && !NOT_IN_TITLES.has(word.toLowerCase());
  });
  return named.length > 0 ? named.join(" or ") : null;
}

// ---- the rules ----------------------------------------------------------------

const ARRANGEMENT_BLOCKED_LABEL: Record<WorkArrangement, string> = {
  remote: "Remote",
  hybrid: "Hybrid with office days",
  onsite: "On-site, no home office",
};

const ARRANGEMENT_WANTED_LABEL: Record<WorkArrangement, string> = {
  remote: "100% remote",
  hybrid: "hybrid",
  onsite: "on-site",
};

const CONTRACT_LABEL: Record<ExcludableContract, string> = {
  werkstudent: "Working student position",
  ausbildung: "Apprenticeship",
  studium: "Dual study programme",
  freelance: "Freelance contract",
  praktikum: "Internship",
};

// A contract form the title itself names. The model alone is not trusted to
// block on it: it has read "Erfahrung aus einem Werkstudentenjob" in the
// requirements as a working-student position before.
const CONTRACT_IN_TITLE: Record<ExcludableContract, RegExp> = {
  werkstudent: /werkstudent|working student/i,
  ausbildung: /ausbildung|azubi|auszubildende|apprentice/i,
  studium: /dual(?:es|er|e)?\s*stud|dual study/i,
  freelance: /freelanc|freiberuf|freie[rn]?\s+mitarbeit/i,
  praktikum: /praktik|\binterns?(?:hip)?\b/i,
};

const WORK_TIME_LABEL: Record<WorkTime, string> = {
  fulltime: "Full-time",
  parttime: "Part-time",
  both: "Full- or part-time",
  minijob: "Minijob",
};

// Which of the preferences page's working-time values a posting offers.
const WORK_TIME_OFFERS: Record<WorkTime, string[]> = {
  fulltime: ["vollzeit"],
  parttime: ["teilzeit"],
  both: ["vollzeit", "teilzeit"],
  minijob: ["minijob"],
};

const LEVEL_RANK: Record<PostingLevel, number> = { junior: 0, mid: 1, senior: 2 };
const LEVEL_LABEL: Record<PostingLevel, string> = {
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
};

// "(Senior)" or "Junior/Senior" in a title means the role is open to more than
// one level — that's for the model to judge from the requirements, not the title.
const SENIOR_TITLE = /\b(senior|sr\.|lead|principal|staff|head of)\b/i;

function isSeniorTitle(title: string): boolean {
  if (/junior|\(\s*senior\s*\)/i.test(title)) return false;
  return SENIOR_TITLE.test(title);
}

/** Below this many characters a posting says too little to prove a fit. */
export const MIN_DESCRIPTION_CHARS = 300;
/** Fewer concrete must-haves than this and "everything is met" means little. */
export const MIN_REQUIREMENTS_FOR_TOP = 3;

const years = (n: number) => `${n} year${n === 1 ? "" : "s"}`;
const cap = (tier: Chance) => (tier === "good" ? "at most Good" : "at most Fair");

/** The tier the checklist alone earns, before any rule pulls it down. */
export function checklistChance(requirements: Requirement[]): Chance {
  const n = requirements.length;
  const missing = requirements.filter((r) => r.status === "missing").length;
  const partial = requirements.filter((r) => r.status === "partial").length;
  // Very good is a count, not a percentage: every must-have met, at most one
  // only partly. One flipped status then moves a job one tier, never two.
  if (n >= MIN_REQUIREMENTS_FOR_TOP && missing === 0 && partial <= 1) return "very_good";
  const coverage = n === 0 ? 1 : (n - missing - partial / 2) / n;
  if (coverage >= 0.65) return "good";
  if (coverage >= 0.4) return "fair";
  return "low";
}

export interface ChanceVerdict {
  chance: Chance;
  /** Hard rules this posting breaks — any one makes it Low. */
  blockers: string[];
  /** Every cap that applies, whether or not it decided the tier. */
  downgrades: string[];
  /** Distance from the nearest of the job's places to the closest home; null when not measured. */
  distanceKm: number | null;
  /** That nearest place. */
  workLocation: string | null;
}

/** The job place closest to any home, and whether some place is within some home's radius. */
function nearestHome(places: PlacePoints[], homes: Home[]) {
  let best = { km: Infinity, place: places[0].label };
  let within = false;
  for (const place of places) {
    for (const home of homes) {
      const km = closestKm(place.points, home.points);
      if (km <= home.radiusKm) within = true;
      if (km < best.km) best = { km, place: place.label };
    }
  }
  return { ...best, within };
}

// Reasons are joined with "; " — a place name must never carry one.
const asLabel = (text: string) => text.replace(/;/g, ",");

/**
 * The tier for one posting: Low on any hard blocker, otherwise the checklist's
 * tier pulled down by every cap that applies.
 */
export function computeChance(facts: PostingFacts, candidate: Candidate): ChanceVerdict {
  const blockers: string[] = [];
  const downgrades: string[] = [];
  let ceiling: Chance = "very_good";
  const limitTo = (tier: Chance, reason: string) => {
    ceiling = lowerChance(ceiling, tier);
    downgrades.push(`${reason} – ${cap(tier)}`);
  };

  // Where the work happens.
  if (
    candidate.arrangements.length > 0 &&
    facts.arrangement !== null &&
    !candidate.arrangements.includes(facts.arrangement)
  ) {
    const wanted = candidate.arrangements.map((a) => ARRANGEMENT_WANTED_LABEL[a]).join(" or ");
    blockers.push(`${ARRANGEMENT_BLOCKED_LABEL[facts.arrangement]} – you only want ${wanted}`);
  }
  const arrangementBlocked = blockers.length > 0;

  // Distance, for work that happens somewhere. Measured from the edge of each
  // city's area (all its postcodes), so "Hamburg + 10 km" includes Norderstedt.
  let distanceKm: number | null = null;
  let workLocation: string | null = null;
  if (
    !arrangementBlocked &&
    facts.arrangement !== "remote" &&
    candidate.homes.length > 0 &&
    facts.places.length > 0
  ) {
    const nearest = nearestHome(facts.places, candidate.homes);
    distanceKm = Math.round(nearest.km);
    workLocation = asLabel(nearest.place);
    if (!nearest.within) {
      const wanted = candidate.homes
        .map((h) => `${h.radiusKm} km of ${asLabel(h.label)}`)
        .join(" or ");
      if (facts.arrangement === null) {
        // The posting never says where the work happens — maybe it's remote after all.
        limitTo("fair", `Based in ${workLocation}, ${distanceKm} km away, remote not mentioned`);
      } else {
        blockers.push(
          `Office in ${workLocation}, ${distanceKm} km away – you want within ${wanted}`,
        );
      }
    }
  }

  // Contract form.
  for (const form of candidate.excludedContracts) {
    if (CONTRACT_IN_TITLE[form].test(facts.title)) {
      blockers.push(`${CONTRACT_LABEL[form]} – you excluded this contract form`);
    } else if (facts.contractForm === form) {
      limitTo("fair", `May be a ${CONTRACT_LABEL[form].toLowerCase()}, which you excluded`);
    }
  }

  // Working time.
  if (facts.workTime !== null && candidate.workTimes.length > 0) {
    const offered = WORK_TIME_OFFERS[facts.workTime];
    if (!offered.some((t) => candidate.workTimes.includes(t))) {
      limitTo("fair", `${WORK_TIME_LABEL[facts.workTime]} – not a working time you want`);
    }
  }

  // Experience. Years the posting states always win over its level label, so
  // the same gap is never counted twice.
  const senior = facts.level === "senior" || isSeniorTitle(facts.title);
  const levels = candidate.targetLevels;
  const seniorBlocked = senior && levels.length > 0 && !levels.includes("senior");
  if (seniorBlocked) {
    blockers.push(
      candidate.levelsDerived && candidate.experienceYears !== null
        ? `Senior role – you have ${years(candidate.experienceYears)} of experience`
        : "Senior role – you're not looking for senior positions",
    );
  }

  // A senior blocker already says it all; repeating the years would only add noise.
  const required = facts.requiredYears;
  if (!seniorBlocked) {
    if (
      required !== null &&
      candidate.maxRequiredYears !== null &&
      required > candidate.maxRequiredYears
    ) {
      blockers.push(
        `${years(required)} of experience required – you accept up to ${candidate.maxRequiredYears}`,
      );
    } else if (required !== null && candidate.experienceYears !== null) {
      const gap = Math.ceil(required - candidate.experienceYears);
      const have = years(candidate.experienceYears);
      if (gap >= 3) blockers.push(`${years(required)} of experience required – you have ${have}`);
      else if (gap === 2) limitTo("fair", `Asks ${years(required)}, you have ${have}`);
      else if (gap === 1) limitTo("good", `Asks ${years(required)}, you have ${have}`);
    } else if (required === null && facts.level !== null && levels.length > 0 && !senior) {
      const rank = LEVEL_RANK[facts.level];
      const ranks = levels.map((l) => LEVEL_RANK[l]);
      if (rank > Math.max(...ranks)) {
        limitTo("fair", `${LEVEL_LABEL[facts.level]} role, above the level you target`);
      } else if (rank < Math.min(...ranks) && !candidate.levelsDerived) {
        limitTo("good", `${LEVEL_LABEL[facts.level]} role, below the level you target`);
      }
    }
  }

  // Core programming language. Without any language in the skills list there's
  // nothing to compare against.
  const titleRequirement = titleLanguageRequirement(facts.title);
  const core = titleRequirement ? [...facts.coreLanguages, titleRequirement] : facts.coreLanguages;
  const missingLanguages =
    candidate.languages.size > 0 ? missingCoreLanguages(core, candidate.languages) : [];
  if (missingLanguages.length > 0) {
    blockers.push(`${missingLanguages.join(", ")} as core language – not in your skills`);
  }

  // Mandatory credentials and spoken languages can't be learned on the job.
  for (const requirement of facts.requirements) {
    if (requirement.status !== "missing") continue;
    if (requirement.kind === "qualification")
      blockers.push(`Missing qualification: ${requirement.text}`);
    if (requirement.kind === "language") blockers.push(`Missing language: ${requirement.text}`);
  }

  // The model only names a dealbreaker; it counts only if the candidate wrote any.
  if (facts.dealbreaker && candidate.hasDealbreakers) {
    blockers.push(`Dealbreaker: ${facts.dealbreaker}`);
  }

  // The work itself. Job titles don't matter, the tasks do: a posting can list
  // few requirements you happen to meet and still be a different line of work.
  if (facts.taskFit === "adjacent") {
    limitTo("good", "Tasks only partly match your experience");
  } else if (facts.taskFit === "different") {
    limitTo("fair", "Tasks differ from what you've done");
  }

  // A posting that says little can't prove a strong fit.
  if (facts.descriptionChars < MIN_DESCRIPTION_CHARS) {
    limitTo("fair", "Little or no job description");
  } else if (facts.requirements.length < MIN_REQUIREMENTS_FOR_TOP) {
    limitTo("good", "Posting names few concrete requirements");
  }

  const chance =
    blockers.length > 0 ? "low" : lowerChance(checklistChance(facts.requirements), ceiling);
  return { chance, blockers, downgrades, distanceKm, workLocation };
}
