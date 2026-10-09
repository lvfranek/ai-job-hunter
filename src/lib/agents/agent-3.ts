import { generateText } from "@/lib/openrouter";
import { MAX_BACKGROUND_CHARS } from "@/lib/preferences";
import { normalizeBlockText } from "@/lib/text-format";
import {
  computeChance,
  readPostingFacts,
  TASK_FITS,
  toCandidate,
  type Candidate,
  type ChanceResult,
} from "@/lib/scoring-rules";
import type { Home, PlacePoints } from "@/lib/geo/distance";
import { resolveJobPlaces, type PlaceIndex } from "@/lib/geo/places";
import type { DbJob, Preferences } from "@/lib/types";

export type { ChanceResult } from "@/lib/scoring-rules";

/** Place data and the candidate's resolved cities, for the distance rule. */
export interface ScoringGeo {
  index: PlaceIndex;
  homes: Home[];
}

// German job postings run 4-12k characters, most of it benefits boilerplate,
// legal text and company blurb after the actual requirements. Sending them whole
// put ~50k tokens in every request, which is what made runs slow enough to trip
// the 90s client timeout and lose a whole chunk at a time.
const MAX_DESCRIPTION_CHARS = 3000;

// Where the work happens is usually stated in the benefits block at the very
// end — exactly the part the cut drops. Without it the model reads most long
// postings as "unknown" workplace and the remote rule never fires (225 of 351
// stored postings were longer than the cut). So the sentences around these
// words survive the cut.
const WORKPLACE_PATTERN =
  /home.?office|remote|hybrid|mobile?s?\s+(?:arbeiten|working)|work(?:ing)?\s+from\s+home|vor ort|on-?site|in[- ]office|office[- ]?(?:tage|days)|präsenz|büro|campus/gi;
const WORKPLACE_CONTEXT_CHARS = 120;
const MAX_WORKPLACE_CHARS = 800;

function workplaceSnippets(text: string): string {
  const windows: Array<[number, number]> = [];
  for (const match of text.matchAll(WORKPLACE_PATTERN)) {
    const start = Math.max(0, match.index - WORKPLACE_CONTEXT_CHARS);
    const end = Math.min(text.length, match.index + match[0].length + WORKPLACE_CONTEXT_CHARS);
    const last = windows[windows.length - 1];
    if (last && start <= last[1]) last[1] = end;
    else windows.push([start, end]);
  }
  return windows
    .map(([start, end]) => text.slice(start, end).replace(/\s+/g, " ").trim())
    .join(" … ")
    .slice(0, MAX_WORKPLACE_CHARS);
}

export function condenseDescription(text: string | null): string {
  if (!text) return "(no description available)";
  // Keep the line structure. Collapsing it away costs almost no tokens to
  // retain (the old `\s+` mostly ate indentation) and headings like
  // "Dein Profil" / "Deine Aufgaben" are exactly how the model tells real
  // requirements apart from benefits boilerplate.
  const collapsed = normalizeBlockText(text);
  if (collapsed.length <= MAX_DESCRIPTION_CHARS) return collapsed;
  const head = `${collapsed.slice(0, MAX_DESCRIPTION_CHARS)} …[truncated]`;
  const workplace = workplaceSnippets(collapsed.slice(MAX_DESCRIPTION_CHARS));
  return workplace
    ? `${head}\n\nWorkplace details from the truncated part: … ${workplace} …`
    : head;
}

const TARGET_LEVEL_LABELS: Record<string, string> = {
  junior: "junior / entry level",
  mid: "mid-level",
  senior: "senior / lead",
};

function orNone(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function candidateProfile(preferences: Preferences): string {
  const levels = (preferences.target_levels ?? []).map((l) => TARGET_LEVEL_LABELS[l] ?? l);
  const background = (preferences.background ?? "").trim().slice(0, MAX_BACKGROUND_CHARS);
  return `Target levels: ${levels.length > 0 ? levels.join(", ") : "not stated"}
Years of relevant professional experience: ${preferences.experience_years ?? "not stated"}
Skills they are strong in: ${orNone(preferences.own_skills, "not listed")}
Skills they know the basics of: ${orNone(preferences.basic_skills, "none listed")}
Education: ${orNone(preferences.education, "not stated")}
Certificates and licences: ${orNone(preferences.certifications, "none listed")}
Spoken languages: ${orNone(preferences.spoken_languages, "not stated")}

The ideal job, in their own words:
"""
${orNone(preferences.notes, "Not described.")}
"""

Dealbreakers — what they never want:
"""
${orNone(preferences.dealbreakers, "None listed.")}
"""

Background / CV:
"""
${background || "Not provided — judge from the skills, education and certificates above."}
"""`;
}

function buildPrompt(jobs: DbJob[], preferences: Preferences): string {
  return `You check job postings against ONE candidate's profile, on the German job
market. You do NOT rate the jobs. You report facts about each posting and check
its must-have requirements against the profile; code decides everything else
from your answers. Be literal and consistent: the same posting must always get
the same answer. The candidate can work in any profession — read their profile
for what it says, not as a software developer by default.

## The candidate
${candidateProfile(preferences)}

## Reading the postings
Most postings are in German, some in English. Read each in its own language.
"Dein Profil", "Das bringst du mit", "Anforderungen", "Your profile" list
requirements; "Wir bieten", "Benefits", "Deine Aufgaben" do not. Anything marked
"Nice to have", "von Vorteil", "wünschenswert", "idealerweise", "gerne",
"ein Plus" is NOT a must-have. Never invent a requirement that is not written
in the posting.

## For each posting, report

- requirements: the posting's MUST-HAVE requirements, at most 8, in the order
  the posting lists them. Leave out years of experience (that is
  required_years), soft skills (communication, teamwork, reliability,
  Belastbarkeit, Teamfähigkeit, Eigeninitiative …) and every nice-to-have.
  Each entry:
    - text: a short label of at most 6 words. Keep the posting's own term for
      tools, software, technologies and certificates ("SAP S/4HANA", "React",
      "Staplerschein"); otherwise short English ("Customer service experience").
    - kind:
        - "qualification": a formal credential the posting makes MANDATORY with
          no alternative — a licence, a state exam or registration, a specific
          completed degree or Ausbildung stated as required ("abgeschlossene
          Ausbildung als Pflegefachkraft", "Führerschein Klasse C zwingend").
          If the posting accepts an alternative ("Studium oder vergleichbare
          Qualifikation", "oder entsprechende Berufserfahrung"), it is "skill".
        - "language": a spoken language the posting requires ("German C1").
        - "skill": everything else — tools, methods, domain knowledge, kinds of
          experience.
    - status, judged ONLY from the candidate profile above:
        - "met": the profile names it or an obvious equivalent (React.js ↔
          React, MS Office ↔ Excel, Kundenberatung ↔ customer service) and they
          used it in work, an Ausbildung, studies or real projects. Anything in
          "Skills they are strong in" counts as met.
        - "partial": only a basic or adjacent version — listed under "basics",
          coursework, a hobby project, a closely related tool (Vue for React),
          a language one level below the one asked for.
        - "missing": nothing related anywhere in the profile.
- required_years: the minimum years of professional experience the posting
  REQUIRES, as a number ("3+ years" → 3, "2-5 Jahre" → 2, "mehrjährige
  Erfahrung" → 2, "erste Berufserfahrung" → 1). null if it names none. Years
  under "Nice to have" don't count.
- posting_level: "junior", "mid" or "senior" — the level the posting ASKS FOR.
    - "senior" if the title says Senior, Lead, Principal, Staff, Head of,
      Leiter, Architekt; or the requirements use senior wording
      ("Senior-Level", "langjährige Berufserfahrung", "Expertenwissen",
      "tiefgreifende Expertise"); or 5+ years are required; or it asks for
      leading a team.
    - "mid" for roughly 2-4 years without senior wording. "Ownership",
      "Verantwortung für …", "eigenständig" alone are not senior.
    - "junior" for entry level, Berufseinsteiger, Absolventen, 0-1 years, or
      no experience requirement at all.
- task_fit: how the posting's day-to-day TASKS ("Deine Aufgaben", "Your
  tasks", what the job is actually about) compare with what the candidate has
  done (background, skills) and the ideal job they describe. Ignore the job
  title — judge the work.
    - "same": they have done these tasks before, at work, in an Ausbildung,
      studies or real projects.
    - "adjacent": similar or neighbouring tasks their background clearly
      prepares them for.
    - "different": tasks unrelated to anything in their profile.
- work_arrangement: where the work happens, as the posting describes it.
    - "remote": fully remote — "100% remote", "full remote", "remote-first",
      "ortsunabhängig", "komplett aus dem Home-Office", or "Remote" in the
      title with no office days in the text. A few on-site team events a year
      still count as remote.
    - "hybrid": ANY regular office presence — "2 Tage Home-Office", "3 Tage im
      Büro", "bis zu 60% mobiles Arbeiten", "Home-Office möglich" without
      saying it's fully remote. "Mobiles Arbeiten" listed as a benefit is
      hybrid too.
    - "onsite": work on site with no home-office option mentioned.
    - "unknown": the posting says nothing about the workplace.
- work_locations: the cities or towns this position is worked from, as the
  posting names them ("Hamburg", "Norderstedt") — not the company's registered
  seat, headquarters or other offices. Several if it can be done at any of
  them. [] if fully remote or no place is named. The board's own location
  field is given as "location" when known.
- contract_form: the position itself, not experience it asks for
  ("Erfahrung aus einem Werkstudentenjob" is still "regular").
  "werkstudent", "ausbildung", "studium" (duales Studium), "praktikum"
  (internship), "freelance", or "regular" for ordinary employment.
- work_time: "fulltime" (Vollzeit), "parttime" (Teilzeit), "both" (either is
  offered), "minijob", or "unknown".
- core_languages: only for programming jobs — the general-purpose programming
  languages the role is BUILT AROUND, canonical names (Java, C#, Python,
  TypeScript …), the language behind a core framework (Spring → Java, .NET →
  C#, Laravel → PHP). Alternatives go in ONE entry joined by " or ". Leave out
  SQL, HTML/CSS, shell and nice-to-haves. [] for every other job.
- dealbreaker: if the posting clearly matches one of the candidate's
  dealbreakers, a short English phrase naming it ("Cold calling", "Shift
  work"); otherwise null. Always null when they listed none.
- reasoning: ONE sentence in English, at most 25 words, addressing the
  candidate as "you": what matches best and the biggest gap. No verdict.

## Output
Return ONLY a minified JSON array — no markdown fences, no commentary — with one
object per posting, fields in this order:
[{"job_id":"uuid","requirements":[{"text":"React","kind":"skill","status":"met"},{"text":"German C1","kind":"language","status":"met"},{"text":"Node.js","kind":"skill","status":"partial"}],"required_years":2,"posting_level":"mid","task_fit":"same","work_arrangement":"hybrid","work_locations":["Hamburg"],"contract_form":"regular","work_time":"fulltime","core_languages":["TypeScript"],"dealbreaker":null,"reasoning":"Your React and TypeScript work fits the core stack; Node.js on the backend is the biggest gap."}]

## Postings
${JSON.stringify(
  jobs.map((j) => ({
    id: j.id,
    title: j.title,
    company: j.company,
    ...(j.location ? { location: j.location } : {}),
    description: condenseDescription(j.description),
  })),
)}`;
}

/**
 * Whether a raw model entry is complete enough to judge. Without the checklist
 * or the task fit there is nothing to compute a tier from — the job stays
 * unscored and the next run retries it, instead of silently landing anywhere.
 */
export function isCompleteEntry(entry: Record<string, unknown>): boolean {
  return (
    Array.isArray(entry.requirements) &&
    (TASK_FITS as string[]).includes(
      String(entry.task_fit ?? "")
        .toLowerCase()
        .trim(),
    )
  );
}

/**
 * One raw model entry → the stored result, with the tier decided in code.
 * `locate` turns the cities the model read into places (the server passes the
 * place data in); without it the distance rule has nothing to measure.
 */
export function toChanceResult(
  entry: Record<string, unknown>,
  job: Pick<DbJob, "id" | "title" | "description">,
  candidate: Candidate,
  locate: (modelCities: string[]) => PlacePoints[] = () => [],
): ChanceResult {
  const facts = readPostingFacts(entry, job);
  facts.places = locate(facts.workLocations);
  const { chance, blockers, downgrades, distanceKm, workLocation } = computeChance(
    facts,
    candidate,
  );
  return {
    job_id: job.id,
    chance,
    requirements: facts.requirements,
    downgrades,
    distance_km: distanceKm,
    work_location: workLocation,
    blocker: blockers.length > 0 ? blockers.join("; ") : null,
    reasoning: typeof entry.reasoning === "string" ? entry.reasoning.trim() : "",
  };
}

/**
 * Pull every balanced {...} out of a malformed response, at any nesting depth,
 * keeping only the ones that look like a job entry and actually parse.
 *
 * This is the salvage path: a response truncated mid-object used to throw from
 * JSON.parse and cost the entire chunk. Here the incomplete tail object is
 * simply never closed, so it's skipped while its finished siblings survive.
 */
function extractJsonObjects(raw: string): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const stack: number[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push(i);
    else if (ch === "}") {
      const start = stack.pop();
      if (start === undefined) continue;
      const slice = raw.slice(start, i + 1);
      if (!slice.includes('"job_id"')) continue;
      try {
        found.push(JSON.parse(slice) as Record<string, unknown>);
      } catch {
        // Not a complete/valid object on its own — drop it, keep scanning.
      }
    }
  }
  return found;
}

/**
 * Parse a scoring response. Accepts a bare array, a `{ "scores": [...] }`-style
 * wrapper, or — when the JSON is broken or truncated — whatever individual score
 * objects can still be salvaged from the raw text.
 */
export function parseScoringResponse(raw: string): Array<Record<string, unknown>> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
    if (parsed && typeof parsed === "object") {
      const wrapper = parsed as Record<string, unknown>;
      for (const key of ["scores", "results", "jobs", "data"]) {
        if (Array.isArray(wrapper[key])) return wrapper[key] as Array<Record<string, unknown>>;
      }
      return [wrapper];
    }
  } catch {
    // Fall through to salvage.
  }

  return extractJsonObjects(cleaned);
}

// Small chunks are the whole point: ~5 condensed descriptions is roughly 5k
// tokens, which comes back in seconds instead of grinding against the request
// timeout — and a chunk that does fail costs five jobs, not twenty-five. Five,
// not six: each answer carries a requirement checklist (~300 tokens per job).
export const CHUNK_SIZE = 5;
const SCORING_MAX_TOKENS = 6000;
const SCORING_SEED = 7;

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Score a single bounded chunk of jobs (<= CHUNK_SIZE) in one AI call. */
export async function scoreChunk(
  jobs: DbJob[],
  preferences: Preferences,
  geo: ScoringGeo | null = null,
): Promise<ChanceResult[]> {
  // Temperature 0 and a fixed seed: the same posting should get the same
  // checklist on every run. The checklist is ~8 entries per job, so the answer
  // needs more room than the client's default.
  const text = await generateText(buildPrompt(jobs, preferences), {
    temperature: 0,
    seed: SCORING_SEED,
    maxTokens: SCORING_MAX_TOKENS,
  });
  const parsed = parseScoringResponse(text);
  const candidate = toCandidate(preferences, geo?.homes);

  const byId = new Map(jobs.map((j) => [j.id, j]));
  const seen = new Set<string>();
  const results: ChanceResult[] = [];
  for (const entry of parsed) {
    const job = byId.get(String(entry.job_id));
    if (!job || seen.has(job.id) || !isCompleteEntry(entry)) continue;
    seen.add(job.id);
    results.push(
      toChanceResult(entry, job, candidate, (cities) =>
        geo ? resolveJobPlaces(geo.index, job, cities) : [],
      ),
    );
  }
  return results;
}
