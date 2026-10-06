// All-time keyword statistics: which search keywords bring in jobs that are
// actually worth something. Pure module (no server imports) so the aggregation
// is unit-testable and the page can share its types.

import { parseDbTimestamp } from "@/lib/db-time";
import { APPLIED_STATUSES } from "@/lib/mock-data";

/** A job at or above this score counts as a good match — same bar as "High matches" on the dashboard. */
export const GOOD_MATCH_SCORE = 80;

/** Each board is scraped once per keyword, so keywords are a small fixed set. */
export const KEYWORD_SLOTS = 5;

// Verdict tuning. "Good matches per search" is the core measure: it combines
// volume and quality and is fair to keywords that have only run a few times.
const MIN_SEARCHES = 3; // fewer than this → not enough data to judge
const REDUNDANT_EXCLUSIVE_SHARE = 0.15; // under 15% of its jobs found by it alone…
const REDUNDANT_MIN_JOBS = 20; // …with enough jobs for that share to mean something
// Compared to the median keyword, so the verdict doesn't shift with the results-per-search setting.
const STRONG_VS_MEDIAN = 1.25;
const WEAK_VS_MEDIAN = 0.6;
const STRONG_MIN_GOOD_PER_SEARCH = 1;
const WEAK_MAX_GOOD_PER_SEARCH = 0.5;

const TREND_RUNS = 15; // runs shown in a keyword's trend line
const RECENT_RUNS = 3; // runs that count as "lately" for freshness

/** "  Full  Stack Developer " → "full stack developer" — how keywords are stored and compared. */
export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Blockers

export type BlockerCategory = "location" | "stack" | "seniority" | "contract" | "other";

export const BLOCKER_CATEGORIES: BlockerCategory[] = [
  "location",
  "stack",
  "seniority",
  "contract",
  "other",
];

export const BLOCKER_LABELS: Record<BlockerCategory, string> = {
  location: "Location / remote",
  stack: "Tech stack",
  seniority: "Seniority",
  contract: "Contract type",
  other: "Other",
};

function categorizeBlockerPart(part: string): BlockerCategory {
  // Contract first: "du schließt Ausbildung … aus" must not fall through to another bucket.
  if (
    /ausbildung|werkstudent|praktikum|freelance|freiberuf|duales studium|weiterbildung|abschlussarbeit|trainee|minijob|teilzeit|befristet|zeitarbeit/i.test(
      part,
    )
  ) {
    return "contract";
  }
  if (/kernsprache|nicht in deinen skills/i.test(part)) return "stack";
  if (/senior|jahre|berufserfahrung|\blead\b|principal/i.test(part)) return "seniority";
  if (/remote|home-?office|hybrid|vor ort|büro|standort|präsenz|deutschland|on-?site/i.test(part)) {
    return "location";
  }
  return "other";
}

/**
 * Which kinds of hard blocker a match carries. Rule-generated blockers look like
 * "Hybrid mit Büro-Tagen – du suchst nur 100% Remote; Java als Kernsprache – …"
 * (see hardBlockers in scoring-rules.ts); the model's own are free text.
 */
export function categorizeBlocker(blocker: string | null): BlockerCategory[] {
  if (!blocker) return [];
  const categories = new Set<BlockerCategory>();
  for (const part of blocker.split(";")) {
    if (part.trim()) categories.add(categorizeBlockerPart(part));
  }
  return [...categories];
}

// ---------------------------------------------------------------------------
// Inputs

export interface StatsJob {
  id: string;
  title: string;
  platform: string;
  status: string | null;
  /** Latest match score, null when never scored. */
  score: number | null;
  blocker: string | null;
}

export interface StatsJobKeyword {
  job_id: string;
  keyword: string;
  discovered: boolean;
}

export interface StatsSearch {
  scrape_run_id: string;
  /** When the scrape run started (DB timestamp). */
  run_at: string;
  keyword: string;
  portal: string;
  returned: number;
  new_jobs: number;
  result_cap: number | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Outputs

export type Verdict = "strong" | "solid" | "weak" | "redundant" | "new";

export interface BoardStat {
  portal: string;
  searches: number;
  returned: number;
  /** Searches that returned as many results as allowed — there was probably more. */
  capHits: number;
  failures: number;
  jobs: number;
  avgScore: number | null;
  goodMatches: number;
  applied: number;
}

export interface KeywordRunPoint {
  runAt: string;
  returned: number;
  newJobs: number;
}

export interface KeywordStat {
  keyword: string;
  /** In the current scraping settings. False = paused (has history, not searched anymore). */
  active: boolean;
  /** Scrape runs that searched this keyword. */
  searches: number;
  firstSearchedAt: string | null;
  lastSearchedAt: string | null;
  /** Distinct jobs this keyword ever found. */
  jobs: number;
  /** Jobs this keyword brought into the DB first. */
  discovered: number;
  /** Jobs no other keyword found. */
  exclusive: number;
  /** The keyword sharing the most jobs with this one. */
  overlap: { keyword: string; shared: number } | null;
  scored: number;
  avgScore: number | null;
  goodMatches: number;
  interested: number;
  applied: number;
  interviews: number;
  notInterested: number;
  jobsPerSearch: number | null;
  newPerSearch: number | null;
  goodPerSearch: number | null;
  /** Scored jobs with at least one hard blocker. */
  blocked: number;
  /** Scored jobs per blocker category (a job can count in several). */
  blockers: Record<BlockerCategory, number>;
  boards: BoardStat[];
  /** Oldest → newest, the last few runs. */
  trend: KeywordRunPoint[];
  /** Share of returned listings that were new — lately vs. before. */
  freshness: { recent: number | null; earlier: number | null };
  verdict: Verdict;
}

export interface StatsOverview {
  totalJobs: number;
  scored: number;
  avgScore: number | null;
  goodMatches: number;
  scrapeRuns: number;
  searches: number;
  trackedSince: string | null;
}

export interface FunnelStep {
  label: string;
  value: number;
}

export interface KeywordSuggestion {
  phrase: string;
  /** Good matches (80+ or applied/interview) whose title contains the phrase. */
  goodJobs: number;
  /** All jobs whose title contains it. */
  jobs: number;
}

export interface StatsResponse {
  /** False until migration 028 (keyword tracking tables) is applied. */
  trackingReady: boolean;
  overview: StatsOverview;
  funnel: FunnelStep[];
  keywords: KeywordStat[];
  boards: BoardStat[];
  suggestions: KeywordSuggestion[];
  activeKeywords: string[];
  goodMatchScore: number;
  keywordSlots: number;
}

// ---------------------------------------------------------------------------
// Aggregation

const isGood = (job: StatsJob) => job.score !== null && job.score >= GOOD_MATCH_SCORE;
// A rejection or an offer still means you applied.
const isApplied = (job: StatsJob) => (APPLIED_STATUSES as string[]).includes(job.status ?? "");
const time = (ts: string) => parseDbTimestamp(ts).getTime();

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function emptyBlockers(): Record<BlockerCategory, number> {
  return { location: 0, stack: 0, seniority: 0, contract: 0, other: 0 };
}

/** Board breakdown from a set of searches plus the jobs they relate to. */
function boardStats(searches: StatsSearch[], jobs: StatsJob[]): BoardStat[] {
  const portals = new Set([...searches.map((s) => s.portal), ...jobs.map((j) => j.platform)]);
  return [...portals]
    .map((portal) => {
      const own = searches.filter((s) => s.portal === portal);
      const portalJobs = jobs.filter((j) => j.platform === portal);
      return {
        portal,
        searches: own.length,
        returned: own.reduce((sum, s) => sum + s.returned, 0),
        capHits: own.filter((s) => s.result_cap !== null && s.returned >= s.result_cap).length,
        failures: own.filter((s) => s.error !== null).length,
        jobs: portalJobs.length,
        avgScore: average(portalJobs.flatMap((j) => (j.score === null ? [] : [j.score]))),
        goodMatches: portalJobs.filter(isGood).length,
        applied: portalJobs.filter(isApplied).length,
      };
    })
    .sort((a, b) => b.jobs - a.jobs || a.portal.localeCompare(b.portal));
}

export function computeStats({
  jobs,
  jobKeywords,
  searches,
  activeKeywords,
  scrapeRuns,
}: {
  jobs: StatsJob[];
  jobKeywords: StatsJobKeyword[];
  searches: StatsSearch[];
  activeKeywords: string[];
  scrapeRuns: number;
}): Omit<StatsResponse, "suggestions" | "trackingReady"> {
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const active = [...new Set(activeKeywords.map(normalizeKeyword).filter(Boolean))];

  // keyword → its jobs; job → every keyword that found it
  const jobsByKeyword = new Map<string, { job: StatsJob; discovered: boolean }[]>();
  const keywordsByJob = new Map<string, Set<string>>();
  for (const link of jobKeywords) {
    const job = jobById.get(link.job_id);
    if (!job) continue;
    const keyword = normalizeKeyword(link.keyword);
    const list = jobsByKeyword.get(keyword) ?? [];
    list.push({ job, discovered: link.discovered });
    jobsByKeyword.set(keyword, list);
    const set = keywordsByJob.get(job.id) ?? new Set<string>();
    set.add(keyword);
    keywordsByJob.set(job.id, set);
  }

  const searchesByKeyword = new Map<string, StatsSearch[]>();
  for (const search of searches) {
    const keyword = normalizeKeyword(search.keyword);
    const list = searchesByKeyword.get(keyword) ?? [];
    list.push(search);
    searchesByKeyword.set(keyword, list);
  }

  const allKeywords = new Set([...active, ...jobsByKeyword.keys(), ...searchesByKeyword.keys()]);

  const keywords: KeywordStat[] = [...allKeywords].map((keyword) => {
    const links = jobsByKeyword.get(keyword) ?? [];
    const kwJobs = links.map((l) => l.job);
    const kwSearches = searchesByKeyword.get(keyword) ?? [];

    // One point per scrape run, summed over boards.
    const runs = new Map<string, KeywordRunPoint>();
    for (const s of kwSearches) {
      const point = runs.get(s.scrape_run_id) ?? { runAt: s.run_at, returned: 0, newJobs: 0 };
      point.returned += s.returned;
      point.newJobs += s.new_jobs;
      runs.set(s.scrape_run_id, point);
    }
    const series = [...runs.values()].sort((a, b) => time(a.runAt) - time(b.runAt));
    const recent = series.slice(-RECENT_RUNS);
    const earlier = series.slice(0, -RECENT_RUNS);
    const freshShare = (points: KeywordRunPoint[]) =>
      ratio(
        points.reduce((sum, p) => sum + p.newJobs, 0),
        points.reduce((sum, p) => sum + p.returned, 0),
      );

    const overlapCounts = new Map<string, number>();
    for (const job of kwJobs) {
      for (const other of keywordsByJob.get(job.id) ?? []) {
        if (other !== keyword) overlapCounts.set(other, (overlapCounts.get(other) ?? 0) + 1);
      }
    }
    const [topOverlap] = [...overlapCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    const scoredJobs = kwJobs.filter((j) => j.score !== null);
    const blockers = emptyBlockers();
    let blocked = 0;
    for (const job of scoredJobs) {
      const categories = categorizeBlocker(job.blocker);
      if (categories.length) blocked++;
      for (const category of categories) blockers[category]++;
    }

    const goodMatches = kwJobs.filter(isGood).length;
    const searchCount = runs.size;
    return {
      keyword,
      active: active.includes(keyword),
      searches: searchCount,
      firstSearchedAt: series[0]?.runAt ?? null,
      lastSearchedAt: series.at(-1)?.runAt ?? null,
      jobs: kwJobs.length,
      discovered: links.filter((l) => l.discovered).length,
      exclusive: kwJobs.filter((j) => keywordsByJob.get(j.id)?.size === 1).length,
      overlap: topOverlap ? { keyword: topOverlap[0], shared: topOverlap[1] } : null,
      scored: scoredJobs.length,
      avgScore: average(scoredJobs.map((j) => j.score as number)),
      goodMatches,
      interested: kwJobs.filter((j) => j.status === "interested").length,
      applied: kwJobs.filter(isApplied).length,
      interviews: kwJobs.filter((j) => j.status === "interview").length,
      notInterested: kwJobs.filter((j) => j.status === "not_interested").length,
      jobsPerSearch: ratio(kwJobs.length, searchCount),
      newPerSearch: ratio(
        kwSearches.reduce((sum, s) => sum + s.new_jobs, 0),
        searchCount,
      ),
      goodPerSearch: ratio(goodMatches, searchCount),
      blocked,
      blockers,
      boards: boardStats(kwSearches, kwJobs),
      trend: series.slice(-TREND_RUNS),
      freshness: { recent: freshShare(recent), earlier: freshShare(earlier) },
      verdict: "new" as Verdict,
    };
  });

  assignVerdicts(keywords);

  keywords.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      (b.goodPerSearch ?? -1) - (a.goodPerSearch ?? -1) ||
      b.jobs - a.jobs ||
      a.keyword.localeCompare(b.keyword),
  );

  const scored = jobs.filter((j) => j.score !== null);
  const interestedOrLater = jobs.filter((j) => j.status === "interested" || isApplied(j)).length;
  const runTimes = searches.map((s) => s.run_at).sort((a, b) => time(a) - time(b));

  return {
    overview: {
      totalJobs: jobs.length,
      scored: scored.length,
      avgScore: average(scored.map((j) => j.score as number)),
      goodMatches: jobs.filter(isGood).length,
      scrapeRuns,
      searches: searches.length,
      trackedSince: runTimes[0] ?? null,
    },
    funnel: [
      { label: "Found", value: jobs.length },
      { label: "Scored", value: scored.length },
      { label: `${GOOD_MATCH_SCORE}+ match`, value: jobs.filter(isGood).length },
      { label: "Interested", value: interestedOrLater },
      { label: "Applied", value: jobs.filter(isApplied).length },
      { label: "Interview", value: jobs.filter((j) => j.status === "interview").length },
    ],
    keywords,
    boards: boardStats(searches, jobs),
    activeKeywords: active,
    goodMatchScore: GOOD_MATCH_SCORE,
    keywordSlots: KEYWORD_SLOTS,
  };
}

/**
 * Strong / solid / weak relative to the median keyword's good matches per
 * search; redundant when another keyword finds almost all the same jobs and
 * does better (so only the weaker of an overlapping pair is flagged).
 */
function assignVerdicts(keywords: KeywordStat[]): void {
  const judged = keywords.filter((k) => k.searches >= MIN_SEARCHES);
  if (judged.length === 0) return;
  const mid = median(judged.map((k) => k.goodPerSearch ?? 0));
  const byKeyword = new Map(keywords.map((k) => [k.keyword, k]));

  for (const k of judged) {
    const good = k.goodPerSearch ?? 0;
    const partner = k.overlap ? byKeyword.get(k.overlap.keyword) : undefined;
    const partnerGood = partner?.goodPerSearch ?? 0;
    const partnerIsBetter =
      partner !== undefined &&
      (partnerGood > good || (partnerGood === good && partner.keyword < k.keyword));

    if (
      k.jobs >= REDUNDANT_MIN_JOBS &&
      k.exclusive / k.jobs < REDUNDANT_EXCLUSIVE_SHARE &&
      partnerIsBetter
    ) {
      k.verdict = "redundant";
    } else if (good >= mid * STRONG_VS_MEDIAN && good >= STRONG_MIN_GOOD_PER_SEARCH) {
      k.verdict = "strong";
    } else if (good <= mid * WEAK_VS_MEDIAN || good < WEAK_MAX_GOOD_PER_SEARCH) {
      k.verdict = "weak";
    } else {
      k.verdict = "solid";
    }
  }
}

// ---------------------------------------------------------------------------
// Keyword suggestions

const MAX_SUGGESTIONS = 8;
const MIN_GOOD_JOBS = 2;
const MAX_PHRASE_WORDS = 3;
// Pulls a phrase's good-match rate toward the overall rate, as if it had this
// many extra average jobs — so "3 of 3" doesn't outrank "16 of 86".
const RATE_PRIOR_JOBS = 5;

// Written as two words as often as one; joined so phrases don't start mid-term
// ("stack product engineer" out of "Full Stack Product Engineer").
const SPLIT_TERMS: [RegExp, string][] = [
  [/\bfull stack\b/g, "fullstack"],
  [/\bfront end\b/g, "frontend"],
  [/\bback end\b/g, "backend"],
];

// Job titles end in the role noun ("AI Engineer", "Frontend Entwickler"), and a
// suggestion has to be something a job board can search for — so it must too.
const ROLE_WORDS = [
  "developer",
  "entwickler",
  "engineer",
  "ingenieur",
  "programmierer",
  "architect",
  "architekt",
  "administrator",
  "designer",
  "consultant",
  "berater",
  "analyst",
  "scientist",
  "specialist",
  "spezialist",
  "informatiker",
];

const STOPWORDS = new Set([
  "und", "and", "oder", "or", "für", "for", "mit", "with", "in", "im", "am", "an", "at",
  "the", "der", "die", "das", "den", "dem", "des", "ein", "eine", "a", "of", "zur", "zum",
  "bei", "als", "to", "on", "by", "de", "remote", "hybrid", "vollzeit", "teilzeit",
  "mwd", "wmd", "all", "genders", "gender", "gn",
]); // prettier-ignore

// "Kontron AIS GmbH: Praktikum …" — a company name before the actual title.
const COMPANY_PREFIX = /^[^:]*\b(gmbh|ag|se|kg|mbh|inc|ltd|e\.v\.|ug)\b[^:]*:\s*/i;

/** Lower-cased word runs of a title, split where a new phrase starts. */
function titleSegments(title: string): string[][] {
  let text = title
    .replace(COMPANY_PREFIX, "")
    .replace(/\([^)]*\)/g, " ") // (m/w/d), (Senior), (100% Remote …)
    .replace(/[*:/]in\b/gi, "") // Entwickler*in, Developer:in, Softwareentwickler/in
    .toLowerCase()
    // Full-Stack → full stack, Frontend-Entwickler → frontend entwickler
    .replace(/(\p{L})-(?=\p{L})/gu, "$1 ");
  for (const [pattern, joined] of SPLIT_TERMS) text = text.replace(pattern, joined);

  return text.split(/\s[-–—]\s|[|,;/&+:]/).map((segment) =>
    segment
      .split(/\s+/)
      .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
      .filter(Boolean),
  );
}

const isRoleWord = (word: string) => ROLE_WORDS.includes(word);
// Single-word German compounds: softwareentwickler, anwendungsentwickler
const isRoleCompound = (word: string) =>
  ROLE_WORDS.some((role) => word.length > role.length + 2 && word.endsWith(role));
const usable = (word: string) => !STOPWORDS.has(word) && !/\d|%|€/.test(word);

/** Candidate search phrases in one title: 2–3 word runs ending in a role, or a role compound. */
function titlePhrases(title: string): Set<string> {
  const phrases = new Set<string>();
  for (const words of titleSegments(title)) {
    words.forEach((word, end) => {
      if (isRoleCompound(word)) phrases.add(word);
      if (!isRoleWord(word)) return;
      for (let size = 2; size <= MAX_PHRASE_WORDS && end - size + 1 >= 0; size++) {
        const run = words.slice(end - size + 1, end + 1);
        if (!run.every(usable)) break;
        phrases.add(run.join(" "));
      }
    });
  }
  return phrases;
}

const compact = (phrase: string) => phrase.replace(/[\s-]+/g, "");

/**
 * Search phrases that show up in the titles of your good jobs far more often
 * than in the rest — and that none of your keywords (active or paused) already
 * covers. Deterministic: plain counting, no AI call.
 */
export function suggestKeywords(jobs: StatsJob[], knownKeywords: string[]): KeywordSuggestion[] {
  const isGoodForYou = (job: StatsJob) => isGood(job) || isApplied(job);
  const counts = new Map<string, { goodJobs: number; jobs: number }>();
  let goodTotal = 0;
  for (const job of jobs) {
    const good = isGoodForYou(job);
    if (good) goodTotal++;
    for (const phrase of titlePhrases(job.title)) {
      const entry = counts.get(phrase) ?? { goodJobs: 0, jobs: 0 };
      entry.jobs++;
      if (good) entry.goodJobs++;
      counts.set(phrase, entry);
    }
  }
  if (jobs.length === 0 || goodTotal === 0) return [];
  const baseRate = goodTotal / jobs.length;

  const known = knownKeywords.map((k) => compact(normalizeKeyword(k))).filter(Boolean);
  // Covered when an existing keyword contains it or it contains an existing keyword.
  const covered = (phrase: string) =>
    known.some((k) => k.includes(compact(phrase)) || compact(phrase).includes(k));

  // Good matches it would bring × how much better than average they are.
  const score = (c: { goodJobs: number; jobs: number }) =>
    c.goodJobs *
    ((c.goodJobs + RATE_PRIOR_JOBS * baseRate) / (c.jobs + RATE_PRIOR_JOBS) - baseRate);

  const candidates = [...counts]
    .filter(([phrase, c]) => c.goodJobs >= MIN_GOOD_JOBS && score(c) > 0 && !covered(phrase))
    .map(([phrase, c]) => ({ phrase, ...c, score: score(c) }));

  // "fullstack product engineer" vs "product engineer": one search per family
  // of overlapping phrases — whichever scores better. When both match exactly
  // the same jobs the shorter one is just a fragment ("learning engineer" out
  // of "machine learning engineer"), so the longer one wins.
  const related = (a: string, b: string) =>
    ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
  const beats = (a: (typeof candidates)[number], b: (typeof candidates)[number]) =>
    a.goodJobs === b.goodJobs && a.jobs === b.jobs
      ? a.phrase.length > b.phrase.length
      : a.score > b.score || (a.score === b.score && a.phrase.length < b.phrase.length);
  const kept = candidates.filter(
    (c) =>
      !candidates.some(
        (other) => other.phrase !== c.phrase && related(c.phrase, other.phrase) && beats(other, c),
      ),
  );

  return kept
    .sort(
      (a, b) => b.score - a.score || b.goodJobs - a.goodJobs || a.phrase.localeCompare(b.phrase),
    )
    .slice(0, MAX_SUGGESTIONS)
    .map(({ phrase, goodJobs, jobs: total }) => ({ phrase, goodJobs, jobs: total }));
}
