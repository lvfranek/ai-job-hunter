// Hard constraints the AI scorer must not be trusted with. The model reads the
// facts out of a posting reliably ("hybrid, 2 days office", "Java backend",
// "Senior" in the title) but then talks itself back into a 90 anyway. So the
// model only reports the facts, and this file decides — deterministically —
// whether a posting breaks something the candidate set.
//
// Pure module, no server imports: the dashboard imports SCORING_VERSION.

import type { Preferences } from "@/lib/types";

/**
 * Version of the scoring logic (prompt + these rules). Every match row stores
 * the version that produced it, and rows from an older version are re-scored on
 * the next run — otherwise a fix here would only ever reach newly scraped jobs.
 * Bump it whenever a change should re-score existing jobs.
 */
export const SCORING_VERSION = 1;

/** Highest score a job can keep once it hits a hard blocker — the prompt's 0-34 band. */
export const BLOCKED_MAX_SCORE = 30;

export type WorkArrangement = "remote" | "hybrid" | "onsite";
export type PostingLevel = "junior" | "mid" | "senior";

/** What the model read out of one posting — facts only, no judgement about the candidate. */
export interface PostingFacts {
  title: string;
  level: PostingLevel | null;
  /** Minimum MANDATORY years of experience, null when the posting names none. */
  requiredYears: number | null;
  /** null when the posting says nothing about where the work happens. */
  arrangement: WorkArrangement | null;
  /** Core programming languages; one entry may list alternatives ("Java oder Kotlin"). */
  coreLanguages: string[];
}

/** Hard limits the candidate stated in their free-text notes. */
export interface CandidateLimits {
  excludeSenior: boolean;
  /** Most REQUIRED years of experience the candidate still accepts. */
  maxRequiredYears: number | null;
}

export const NO_LIMITS: CandidateLimits = { excludeSenior: false, maxRequiredYears: null };

export interface ScoringResult {
  job_id: string;
  match_score: number;
  skill_overlap_pct: number;
  seniority_fit: number;
  location_fit: number;
  employment_fit: number;
  blocker: string | null;
  reasoning: string;
}

// ---- reading the model's facts ----------------------------------------------

const ARRANGEMENTS: WorkArrangement[] = ["remote", "hybrid", "onsite"];
const LEVELS: PostingLevel[] = ["junior", "mid", "senior"];

export function readPostingFacts(entry: Record<string, unknown>, title: string): PostingFacts {
  const arrangement = String(entry.work_arrangement ?? "").toLowerCase();
  const level = String(entry.posting_level ?? "").toLowerCase();
  const years = Number(entry.required_years);
  return {
    title,
    level: LEVELS.includes(level as PostingLevel) ? (level as PostingLevel) : null,
    requiredYears:
      entry.required_years != null && Number.isFinite(years) && years > 0 ? years : null,
    arrangement: ARRANGEMENTS.includes(arrangement as WorkArrangement)
      ? (arrangement as WorkArrangement)
      : null,
    coreLanguages: Array.isArray(entry.core_languages)
      ? entry.core_languages.filter((l): l is string => typeof l === "string" && l.trim() !== "")
      : [],
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
 * alternatives ("Java oder Python") is met by any one of them. Names the model
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
    if (!missing.has(key)) missing.set(key, options.join(" oder "));
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
  return named.length > 0 ? named.join(" oder ") : null;
}

// ---- the rules ----------------------------------------------------------------

const ARRANGEMENT_BLOCKED_LABEL: Record<WorkArrangement, string> = {
  remote: "Remote",
  hybrid: "Hybrid mit Büro-Tagen",
  onsite: "Vor Ort, kein Home-Office",
};

const ARRANGEMENT_WANTED_LABEL: Record<WorkArrangement, string> = {
  remote: "100% Remote",
  hybrid: "Hybrid",
  onsite: "Vor Ort",
};

/** Preferences page stores "on-site"; the scorer says "onsite". */
function acceptedArrangements(jobType: string[] | null | undefined): WorkArrangement[] {
  return (jobType ?? [])
    .map((t) => (t === "on-site" ? "onsite" : t))
    .filter((t): t is WorkArrangement => ARRANGEMENTS.includes(t as WorkArrangement));
}

// "(Senior)" or "Junior/Senior" in a title means the role is open to more than
// one level — that's for the model to judge from the requirements, not the title.
const SENIOR_TITLE = /\b(senior|sr\.|lead|principal|staff|head of)\b/i;

function isSeniorTitle(title: string): boolean {
  if (/junior|\(\s*senior\s*\)/i.test(title)) return false;
  return SENIOR_TITLE.test(title);
}

/** Every hard constraint this posting breaks, as short German phrases for the UI. */
export function hardBlockers(
  facts: PostingFacts,
  preferences: Pick<Preferences, "job_type" | "own_skills" | "preferred_languages">,
  limits: CandidateLimits,
): { blockers: string[]; arrangement: boolean; seniority: boolean } {
  const blockers: string[] = [];

  const accepted = acceptedArrangements(preferences.job_type);
  const arrangement =
    accepted.length > 0 && facts.arrangement !== null && !accepted.includes(facts.arrangement);
  if (arrangement) {
    const wanted = accepted.map((a) => ARRANGEMENT_WANTED_LABEL[a]).join(" oder ");
    blockers.push(`${ARRANGEMENT_BLOCKED_LABEL[facts.arrangement!]} – du suchst nur ${wanted}`);
  }

  const senior = facts.level === "senior" || isSeniorTitle(facts.title);
  const tooManyYears =
    limits.maxRequiredYears !== null &&
    facts.requiredYears !== null &&
    facts.requiredYears > limits.maxRequiredYears;
  if (limits.excludeSenior && senior) {
    blockers.push("Senior-Stelle – du suchst keine Senior-Positionen");
  } else if (tooManyYears) {
    blockers.push(
      `${facts.requiredYears} Jahre Erfahrung gefordert – du suchst Stellen bis ${limits.maxRequiredYears} Jahre`,
    );
  }

  const known = candidateLanguages(preferences.own_skills, preferences.preferred_languages);
  // Without any language in the skills list there's nothing to compare against.
  const titleRequirement = titleLanguageRequirement(facts.title);
  const core = titleRequirement ? [...facts.coreLanguages, titleRequirement] : facts.coreLanguages;
  const missing = known.size > 0 ? missingCoreLanguages(core, known) : [];
  if (missing.length > 0) {
    blockers.push(`${missing.join(", ")} als Kernsprache – nicht in deinen Skills`);
  }

  return {
    blockers,
    arrangement,
    seniority: (limits.excludeSenior && senior) || tooManyYears,
  };
}

/**
 * Apply the hard rules on top of the model's result: a broken rule pushes the
 * job into the blocked band and names the reason, whatever the model scored.
 */
export function applyHardRules(
  result: ScoringResult,
  facts: PostingFacts,
  preferences: Pick<Preferences, "job_type" | "own_skills" | "preferred_languages">,
  limits: CandidateLimits,
): ScoringResult {
  const { blockers, arrangement, seniority } = hardBlockers(facts, preferences, limits);
  if (blockers.length === 0) return result;
  return {
    ...result,
    // The model's own blocker usually restates one of these less precisely.
    blocker: blockers.join("; "),
    match_score: Math.min(result.match_score, BLOCKED_MAX_SCORE),
    location_fit: arrangement ? 0 : result.location_fit,
    seniority_fit: seniority ? 0 : result.seniority_fit,
  };
}
