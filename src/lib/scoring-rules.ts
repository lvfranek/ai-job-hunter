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
export const SCORING_VERSION = 8;

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
  /** Which of the candidate's main-focus items the model says the role centres on; null when not reported. */
  focusCentral: string[] | null;
}

export interface ChanceResult {
  job_id: string;
  chance: Chance;
  requirements: Requirement[];
  downgrades: string[];
  distance_km: number | null;
  work_location: string | null;
  work_arrangement: WorkArrangement | null;
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
const MAX_CORE = 4;
const MAX_REQUIREMENT_CHARS = 60;

// Years of experience are judged from required_years by the experience rule;
// listing them again would count the same gap twice.
const YEARS_REQUIREMENT =
  /\d\s*\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?|jahre?n?)\b|mehrjährig|langjährig|several years|many years/i;

// Soft skills can't be checked against a CV and only ever count against the
// candidate; the prompt leaves them out, and this catches the ones it lists anyway.
const SOFT_SKILL =
  /team(?:f(?:ae|ä)hig|geist|player|work|spieler)|kommunikations(?:f(?:ae|ä)hig|st(?:ae|ä)rk)|communication skills|eigeninitiative|eigenverantwort|selbstst(?:ae|ä)ndig|zuverl(?:ae|ä)ssig|belastbar|flexibilit|lernbereit|motivation|engagement|auftreten|analytisch|strukturiert|organisationstalent|hands-on|problem-?solving|teamwork|reliab|proactiv|initiative|empath|kundenorientier|sorgf(?:ae|ä)ltig|verantwortungsbewusst|interesse an|interest in|leidenschaft|passion/i;
const LANGUAGE_WORD = /deutsch|englisch|german|english|sprach|language/i;

function isSoftSkill(text: string): boolean {
  return SOFT_SKILL.test(text) && !LANGUAGE_WORD.test(text);
}

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
    const kind = pick<RequirementKind>(entry.kind, REQUIREMENT_KINDS) ?? "skill";
    if (kind !== "language" && isSoftSkill(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    requirements.push({
      text:
        text.length > MAX_REQUIREMENT_CHARS ? `${text.slice(0, MAX_REQUIREMENT_CHARS - 1)}…` : text,
      kind,
      status,
      evidence: textOrNull(entry.evidence)?.slice(0, 120) ?? null,
      // The model sometimes calls nearly everything core; only the first few count.
      core: entry.core === true && requirements.filter((r) => r.core).length < MAX_CORE,
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
    focusCentral: Array.isArray(entry.focus_central)
      ? entry.focus_central.filter((f): f is string => typeof f === "string" && f.trim() !== "")
      : null,
  };
}

// ---- checking the model's claims ------------------------------------------------

/** Lower-case words only, so "Next.js", "next js" and "NEXT.JS" compare equal. */
export function normalizeEvidence(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

// Filler words a quote may carry that prove nothing on their own.
const EVIDENCE_FILLER = new Set([
  "und",
  "and",
  "the",
  "der",
  "die",
  "das",
  "mit",
  "with",
  "von",
  "for",
  "fuer",
]);

/** Whether a requirement and its quote name the same thing ("Python-Kenntnisse" ↔ "Python"). */
export function sharesWord(requirement: string, evidence: string): boolean {
  const words = (text: string) =>
    normalizeEvidence(text)
      .split(" ")
      .filter((w) => w.length >= 2 && !EVIDENCE_FILLER.has(w));
  const asked = words(requirement);
  return words(evidence).some((e) =>
    asked.some(
      (a) => a === e || (e.length >= 3 && a.includes(e)) || (a.length >= 3 && e.includes(a)),
    ),
  );
}

/** Whether a quote really appears in the profile — as a phrase, or every word of it. */
export function evidenceIn(profile: string, evidence: string): boolean {
  const quote = normalizeEvidence(evidence);
  if (quote.length < 2) return false;
  const haystack = ` ${profile} `;
  if (haystack.includes(` ${quote} `)) return true;
  const words = quote.split(" ").filter((w) => w.length >= 3 && !EVIDENCE_FILLER.has(w));
  return words.length > 0 && words.every((w) => haystack.includes(` ${w} `));
}

/**
 * The model claims a requirement is met; the code checks the profile words it
 * quotes as proof. A small model marks Kubernetes or Power BI as "met" for a
 * React developer often enough to put the wrong jobs on top — without a real
 * quote a claim counts as missing, and a quote from the basics list only as
 * partly met.
 */
export function verifyRequirements(
  requirements: Requirement[],
  candidate: Candidate,
): Requirement[] {
  return requirements.map((requirement) => {
    if (requirement.status === "missing") return requirement;
    // Nothing to check a language against when the profile names none.
    if (requirement.kind === "language" && !candidate.languagesStated) return requirement;
    const evidence = requirement.evidence ?? "";
    if (evidence && evidenceIn(candidate.profile.strong, evidence)) {
      // "Azure: met — Google Cloud" is a neighbouring tool, not the thing asked
      // for. Fully met needs the quote to name it; languages translate freely.
      const named = requirement.kind === "language" || sharesWord(requirement.text, evidence);
      return requirement.status === "met" && !named
        ? { ...requirement, status: "partial" }
        : requirement;
    }
    if (evidence && evidenceIn(candidate.profile.basic, evidence)) {
      return { ...requirement, status: "partial" };
    }
    return { ...requirement, status: "missing", evidence: null };
  });
}

// What a posting has to say before "remote" is believed. "Home-Office möglich"
// or "mobiles Arbeiten" alone is hybrid in German postings.
const REMOTE_EVIDENCE =
  /\bremote\b|ortsunabh(?:ae|ä)ngig|100\s?%\s?(?:home[\s-]?office|mobil)|(?:komplett|vollst(?:ae|ä)ndig|ausschlie(?:ss|ß)lich)\s+(?:im|aus dem|von zu hause|vom)\s*home[\s-]?office|work from (?:home|anywhere)|full[\s-]?home[\s-]?office/i;

/** "remote" from the model only counts when the posting itself says so. */
export function confirmRemote(
  arrangement: WorkArrangement | null,
  postingText: string,
): WorkArrangement | null {
  if (arrangement !== "remote") return arrangement;
  return REMOTE_EVIDENCE.test(postingText) ? "remote" : null;
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
  | "background"
  | "education"
  | "certifications"
  | "spoken_languages"
  | "focus_skills"
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
  /** Normalised profile text a requirement's evidence must appear in. */
  profile: { strong: string; basic: string };
  languagesStated: boolean;
  /** What they most want to work with; jobs centred on something else stay at most Good. */
  focus: { items: string[]; languages: Set<string> };
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
    profile: {
      // Notes and dealbreakers are wishes, not abilities — never evidence.
      strong: normalizeEvidence(
        [
          prefs.own_skills,
          prefs.background,
          prefs.education,
          prefs.certifications,
          prefs.spoken_languages,
        ]
          .filter(Boolean)
          .join(" \n "),
      ),
      basic: normalizeEvidence(prefs.basic_skills ?? ""),
    },
    languagesStated: Boolean(prefs.spoken_languages?.trim()),
    focus: {
      items: (prefs.focus_skills ?? "")
        .split(/[,;\n]+/)
        .map((item) => item.trim())
        .filter(Boolean),
      languages: candidateLanguages(prefs.focus_skills),
    },
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

/** Without the model's marks, the first requirements listed stand in for the core ones. */
const FALLBACK_CORE = 3;

/** The requirements the role is built around — marked by the model, else the first few. */
export function coreRequirements(requirements: Requirement[]): Requirement[] {
  const marked = requirements.filter((r) => r.core);
  return marked.length > 0 ? marked : requirements.slice(0, FALLBACK_CORE);
}

/** Share of the must-haves covered, a partial counting half. */
function coverage(requirements: Requirement[]): number {
  if (requirements.length === 0) return 1;
  const covered = requirements.reduce(
    (sum, r) => sum + (r.status === "met" ? 1 : r.status === "partial" ? 0.5 : 0),
    0,
  );
  return covered / requirements.length;
}

/**
 * The tier the checklist alone earns, before any rule pulls it down. The core
 * requirements — what the role is built around — weigh most; the rest counts
 * as a share. Missing one side requirement out of eight still leaves a Very
 * good; missing the main technology never does.
 */
export function checklistChance(requirements: Requirement[]): Chance {
  const share = coverage(requirements);
  const core = coreRequirements(requirements);
  const coreMissing = core.filter((r) => r.status === "missing").length;
  const coreAllMet = core.every((r) => r.status === "met");
  const missing = requirements.filter((r) => r.status === "missing").length;
  if (
    requirements.length >= MIN_REQUIREMENTS_FOR_TOP &&
    coreAllMet &&
    missing <= 1 &&
    share >= 0.8
  ) {
    return "very_good";
  }
  // One key gap is fine for Good when nearly everything else fits.
  if ((coreMissing === 0 && share >= 0.55) || (coreMissing === 1 && share >= 0.75)) {
    return "good";
  }
  if ((coreMissing <= 1 && share >= 0.4) || share >= 0.6) return "fair";
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

const wantedLabel = (wanted: WorkArrangement[]) =>
  wanted.map((a) => ARRANGEMENT_WANTED_LABEL[a]).join(" or ");

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

  // Where the work happens. Remote is fine when remote is wanted. Anything
  // else is decided by place once the candidate named cities: inside a radius
  // is fine whether hybrid or on site, outside is Low. Without cities, the
  // ticked arrangements decide.
  let distanceKm: number | null = null;
  let workLocation: string | null = null;
  const wanted = candidate.arrangements;
  const remoteOnly = wanted.length > 0 && wanted.every((a) => a === "remote");
  if (facts.arrangement === "remote") {
    if (wanted.length > 0 && !wanted.includes("remote")) {
      blockers.push(`${ARRANGEMENT_BLOCKED_LABEL.remote} – you only want ${wantedLabel(wanted)}`);
    }
  } else if (remoteOnly) {
    blockers.push(
      facts.arrangement === null
        ? "Not clearly remote – the posting never says it's remote"
        : `${ARRANGEMENT_BLOCKED_LABEL[facts.arrangement]} – you only want 100% remote`,
    );
  } else if (candidate.homes.length > 0) {
    if (facts.places.length > 0) {
      // Measured from the edge of each city's area (all its postcodes), so
      // "Hamburg + 10 km" includes Norderstedt.
      const nearest = nearestHome(facts.places, candidate.homes);
      distanceKm = Math.round(nearest.km);
      workLocation = asLabel(nearest.place);
      if (!nearest.within) {
        const radii = candidate.homes
          .map((h) => `${h.radiusKm} km of ${asLabel(h.label)}`)
          .join(" or ");
        blockers.push(
          `Office in ${workLocation}, ${distanceKm} km away – you want within ${radii}`,
        );
      }
    } else {
      // Not a cap: only a job that's provably too far is held back.
      downgrades.push("Location unknown – check the distance yourself");
    }
  } else if (
    facts.arrangement !== null &&
    wanted.length > 0 &&
    !wanted.includes(facts.arrangement)
  ) {
    blockers.push(
      `${ARRANGEMENT_BLOCKED_LABEL[facts.arrangement]} – you only want ${wantedLabel(wanted)}`,
    );
  }

  // Contract form.
  for (const form of candidate.excludedContracts) {
    if (CONTRACT_IN_TITLE[form].test(facts.title)) {
      blockers.push(`${CONTRACT_LABEL[form]} – you excluded this contract form`);
    } else if (facts.contractForm === form) {
      const label = CONTRACT_LABEL[form].toLowerCase();
      const article = /^[aeiou]/.test(label) ? "an" : "a";
      limitTo("fair", `May be ${article} ${label}, which you excluded`);
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

  // Main focus. For a programming job the core language decides, in code; for
  // anything else the model says which focus items the work centres on.
  const focus = candidate.focus;
  if (focus.items.length > 0) {
    const focusList = asLabel(focus.items.join(", "));
    const coreWithLanguage = core.filter(
      (entry) => missingCoreLanguages([entry], new Set()).length > 0,
    );
    if (focus.languages.size > 0 && coreWithLanguage.length > 0) {
      // Off focus only when no core entry can be met by a focus language.
      const offFocus = missingCoreLanguages(coreWithLanguage, focus.languages);
      if (
        coreWithLanguage.every((entry) => missingCoreLanguages([entry], focus.languages).length)
      ) {
        limitTo("good", `Built on ${offFocus.join(", ")}, not your main focus (${focusList})`);
      }
    } else if (facts.focusCentral !== null) {
      const wanted = new Set(focus.items.map(normalizeEvidence));
      const central = facts.focusCentral.filter((f) => wanted.has(normalizeEvidence(f)));
      if (central.length === 0) limitTo("good", `Not centred on your main focus (${focusList})`);
    }
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
