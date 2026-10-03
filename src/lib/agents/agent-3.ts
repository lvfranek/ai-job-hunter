import { generateText } from "@/lib/openrouter";
import { normalizeBlockText } from "@/lib/text-format";
import {
  applyHardRules,
  BLOCKED_MAX_SCORE,
  NO_LIMITS,
  readPostingFacts,
  type CandidateLimits,
  type ScoringResult,
} from "@/lib/scoring-rules";
import type { DbJob, Preferences } from "@/lib/types";

export type { ScoringResult } from "@/lib/scoring-rules";

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
  /home.?office|remote|hybrid|mobile?s?\s+(?:arbeiten|working)|vor ort|on-?site|präsenz|büro|office-?tage|campus/gi;
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
  if (!text) return "(keine Beschreibung verfügbar)";
  // Keep the line structure. Collapsing it away costs almost no tokens to
  // retain (the old `\s+` mostly ate indentation) and headings like
  // "Dein Profil" / "Deine Aufgaben" are exactly how the model tells real
  // requirements apart from benefits boilerplate.
  const collapsed = normalizeBlockText(text);
  if (collapsed.length <= MAX_DESCRIPTION_CHARS) return collapsed;
  const head = `${collapsed.slice(0, MAX_DESCRIPTION_CHARS)} …[gekürzt]`;
  const workplace = workplaceSnippets(collapsed.slice(MAX_DESCRIPTION_CHARS));
  return workplace
    ? `${head}\n\nAngaben zum Arbeitsort aus dem gekürzten Teil: … ${workplace} …`
    : head;
}

const EMPLOYMENT_LABELS: Record<string, string> = {
  freelance: "Freelance / freiberuflich",
  ausbildung: "Ausbildung",
  studium: "duales Studium / Studium",
  werkstudent: "Werkstudent",
};

const WORK_ARRANGEMENT_LABELS: Record<string, string> = {
  remote: "100% remote — no regular office days at all",
  hybrid: "hybrid — regular office days",
  "on-site": "on-site in the office",
};

const WORK_TIME_LABELS: Record<string, string> = {
  vollzeit: "Vollzeit",
  teilzeit: "Teilzeit",
  minijob: "Minijob / geringfügige Beschäftigung",
};

function labelList(values: string[], labels: Record<string, string>): string {
  const mapped = (values ?? []).map((v) => labels[v] ?? v).filter(Boolean);
  return mapped.length > 0 ? mapped.join(", ") : "";
}

function buildPrompt(jobs: DbJob[], preferences: Preferences): string {
  const excludedEmployment = labelList(
    preferences.excluded_employment_types ?? [],
    EMPLOYMENT_LABELS,
  );
  const workTime = labelList(preferences.work_time_models ?? [], WORK_TIME_LABELS);
  const arrangements = labelList(preferences.job_type ?? [], WORK_ARRANGEMENT_LABELS);
  const softSkillRule = preferences.soft_skills_flexible
    ? `THE CANDIDATE HAS MARKED SOFT SKILLS AS FLEXIBLE. Treat every soft-skill
requirement in a posting (Zuverlässigkeit, Teamfähigkeit, Belastbarkeit,
Kommunikationsstärke, Eigeninitiative, Flexibilität, Motivation …) as FULLY MET.
Never deduct a single point for a soft skill, and never name one as a gap.`
    : `Soft skills are treated like any other requirement.`;

  return `You are an expert job-fit evaluator working for ONE candidate on the GERMAN job
market. Your scores decide which postings this person ever gets to see.

## Your bias: recall over precision
This candidate is early in their career and actively job hunting. Missing a good
opportunity is far more damaging than surfacing a mediocre one. When you are torn
between two scores, GIVE THE HIGHER ONE. A posting that is merely imperfect must
never end up in the same band as one that is genuinely impossible.

This bias NEVER overrides something the candidate explicitly ruled out in their own
words below. "Recall over precision" is about imperfect fits, not about postings
they said they don't want.

## The candidate

What they want, in their own words — this is your PRIMARY signal. Anything they
explicitly say they do NOT want is a hard blocker (see below), exactly like the
exclusion lists:
"""
${preferences.notes || "No specific preferences given."}
"""

Skills they actually have: ${preferences.own_skills || "not specified"}
Programming languages they'd prefer to work in: ${preferences.preferred_languages || "no preference"}
Preferred location: ${preferences.preferred_location || "any"}
Work arrangements they accept: ${arrangements || "any"}${
    arrangements ? " — anything else is a hard blocker" : ""
  }
Contract forms they do NOT want — treat each of these as a hard blocker: ${
    excludedEmployment || "none excluded — every contract form is acceptable"
  }
Acceptable working-time models: ${workTime || "no preference — do not penalise any working-time model"}

${softSkillRule}

## Reading the postings
The postings are in German. Read them as German and connect German and English
terminology yourself: Werkstudent, Praktikum, Ausbildung, duales Studium,
Vollzeit/Teilzeit, unbefristet, (m/w/d), Berufserfahrung, Kenntnisse,
"Wir bieten", "Dein Profil", "Nice to have". Never invent a requirement that is
not written in the posting.

## Score bands — calibrate against these, they must be comparable across jobs
- 90-100: stack, level, location and contract form all fit. Apply immediately.
- 75-89: clear match with one small gap.
- 55-74: solid option. Partial match, but applying is clearly worth it.
- 35-54: long shot, still not excluded.
- 0-34: ONLY when you can name a hard blocker (see below). Never otherwise.

## Hard blockers — the ONLY justification for a score under 35
Score below 35 only if one of these is true, and then you MUST name it in the
"blocker" field in short, plain German:
- The posting's work_arrangement (Step 1) is not one the candidate accepts —
  e.g. hybrid with office days when they only accept 100% remote.
- Location is unreachable and the posting offers no remote option, while the
  candidate needs a different region.
- A completed degree or Ausbildung is MANDATORY and the candidate does not have it.
- A language is MANDATORY that the candidate does not speak.
- The posting's contract form appears on the candidate's exclusion list above
  (e.g. it is a Werkstudentenstelle and they excluded Werkstudent).
- The posting is explicitly senior-only ("mindestens 5 Jahre Berufserfahrung
  zwingend", "nur für erfahrene …").
- A core programming language (Step 1: core_languages) is not in the
  candidate's skills.
- "ruled_out" is not null (see "Step 1" below).
If none of these apply, "blocker" MUST be null and the score MUST be 35 or above.

## What must NOT sink a score
- "2-3 Jahre Berufserfahrung" for an early-career candidate: moderate deduction
  only, never a blocker — UNLESS the candidate stated their own experience or an
  experience limit that the posting exceeds, or ruled out this posting's level
  (see "Step 1"). The candidate's own words always win over this rule. German employers routinely hire under specification.
- A framework the candidate hasn't used, in a language they know (React ↔ Vue ↔
  Angular, Django ↔ FastAPI, MySQL ↔ Postgres): small deduction only — these
  transfer. A different core programming language does NOT transfer: a Java,
  C# or PHP role is not a fit for someone whose skills list has none of them.
- Anything listed under "Nice to have" / "Von Vorteil" / "Wünschenswert": no
  deduction at all.
- A long wish list of technologies: judge the CORE requirements, not the wish list.

## Step 1 — read the facts out of each posting BEFORE you score it
These fields are plain facts about the posting. The recall bias does NOT apply
here: answer what the posting says, not what would be kind to the candidate.

- work_arrangement: where the work happens, as the posting describes it.
    - "remote": fully remote — "100% remote", "full remote", "remote-first",
      "ortsunabhängig", "komplett aus dem Home-Office", or "Remote" in the title
      with no office days in the text. Occasional team events or onboarding on
      site (a few times a year) still count as remote.
    - "hybrid": ANY regular office presence — "2 Tage Home-Office", "3 Tage im
      Büro", "bis zu 60% mobiles Arbeiten", "flexibel zwischen Büro und
      Home-Office", "Home-Office möglich" without saying it's fully remote.
      "Mobiles Arbeiten" / "Mobile Working" listed as a benefit is hybrid too —
      in German postings it means partial home office, not a remote job.
    - "onsite": office work with no home-office option mentioned.
    - "unknown": the posting says nothing about the workplace at all.
- core_languages: the general-purpose programming languages the role is BUILT
  AROUND — what the main day-to-day code is written in. Use canonical names
  (Java, Kotlin, C#, C++, Go, PHP, Python, Ruby, TypeScript, JavaScript, Swift,
  Dart …). Name the language behind a core framework (Spring → Java, .NET → C#,
  Laravel → PHP, Rails → Ruby). If the posting offers alternatives, put them in
  ONE entry joined by " oder " ("Java oder Python"). Leave out SQL, HTML/CSS,
  shell scripting, anything under "Nice to have" / "von Vorteil", and side
  mentions. [] if the posting names no programming language.
- required_years: the minimum years of professional experience the posting
  REQUIRES, as a number ("3+ years" → 3, "2-5 Jahre" → 2, "mehrjährige
  Erfahrung" → 2). null if it names none. Years under "Nice to have" don't count.

- posting_level: "junior", "mid" or "senior" — the level the posting ASKS FOR.
  "senior" if ANY of these hold, even under a neutral title like "Full-Stack
  Developer":
    - the title says Senior, Lead, Principal, Staff, Head of, Architekt
    - the requirements use senior wording: "Senior-Level", "Senior-Erfahrung",
      "auf Senior-Niveau", "langjährige Berufserfahrung", "Expertenwissen",
      "Experte in …", "beherrschst … blind", "tiefgreifende Expertise"
    - 5 or more years of professional experience are required
    - it asks for technical or disciplinary leadership of a team
  NOT senior on their own — these are "mid" at most:
    - 2, 3 or 4 years of experience ("3+ years", "mehrjährige Erfahrung")
    - "Ownership", "Verantwortung für …", "you own the feature / the interface"
      — that is owning work, not leading people
    - "eigenständig", "selbstständig arbeiten"
  "mid" for roughly 2-4 years without senior wording. "junior" for entry level,
  Berufseinsteiger, 0-1 years, or no experience requirement at all.
- ruled_out: go through everything the candidate says they do NOT want in their
  own words above. If this posting matches one of those things, a short German
  phrase naming it (e.g. "Senior-Stelle – du suchst keine Senior-Positionen"),
  otherwise null.
  The candidate's own definitions beat the general ones above. If they state how
  much experience they have or accept (e.g. "ich habe 1 Jahr Erfahrung", "keine
  Stellen ab 3 Jahren"), apply it literally: a posting that REQUIRES more years
  than that is ruled_out ("3 Jahre gefordert – du hast 1 Jahr"), whatever
  posting_level says. Years under "Nice to have" / "von Vorteil" don't count. If they ruled out senior positions and posting_level is
  "senior", ruled_out MUST be set. Missing years of experience are NOT a reason
  to relax this — "Senior-Level" alone is enough.

A job with ruled_out set is a hard blocker: score under 35 and repeat the phrase
in "blocker".

## Output
For every job return these fields, in this order:
- work_arrangement, core_languages, required_years, posting_level and
  ruled_out (Step 1).
- match_score (0-100): REQUIRED, never leave it out. The overall band from the
  scale above. Weight skills heaviest, then employment/location fit, then
  seniority.
- skill_overlap_pct (0-100): how well the required tech matches the candidate's
  skills and the stack they described wanting.
- seniority_fit (0-100): how well the required experience level matches. Apply
  the "must not sink a score" rule above. 0 if the candidate ruled out this
  posting's level.
- location_fit (0-100): location and remote policy vs. the candidate's preference.
- employment_fit (0-100): 0 if the posting's contract form is on the exclusion
  list above — that is a blocker. Otherwise judge the working-time model against
  the candidate's accepted list, and return 100 if they stated no preference.
- blocker: short German phrase naming the hard blocker, or null. Null unless the
  score is under 35.
- reasoning: 1-2 concrete sentences IN GERMAN. Name the specific technology or
  aspect that matches AND the one thing that doesn't. No generic filler.

Return ONLY a valid JSON array — no markdown fences, no commentary:
[
  {
    "job_id": "uuid",
    "work_arrangement": "remote",
    "core_languages": ["TypeScript"],
    "required_years": 2,
    "posting_level": "mid",
    "ruled_out": null,
    "match_score": 78,
    "skill_overlap_pct": 88,
    "seniority_fit": 60,
    "location_fit": 90,
    "employment_fit": 100,
    "blocker": null,
    "reasoning": "React und TypeScript sind exakt dein Stack, Remote passt. Gefordert sind 2 Jahre Erfahrung — als Junior knapp darunter, Bewerbung lohnt trotzdem."
  }
]

## Jobs to score
${JSON.stringify(
  jobs.map((j) => ({
    id: j.id,
    title: j.title,
    company: j.company,
    description: condenseDescription(j.description),
  })),
)}`;
}

function clampScore(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function textOrNull(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.toLowerCase() !== "null" ? text : null;
}

/**
 * Turn one raw model entry into a ScoringResult. A posting the candidate ruled
 * out in their own words is forced into the blocked band here rather than
 * trusted to the model: in practice it classifies "this is senior" correctly
 * and then talks itself back into a 90 because of the recall bias.
 *
 * The model's own "blocker" alone does NOT cap the score — it occasionally
 * invents one (reading "Erfahrung aus einem Werkstudentenjob" as a
 * Werkstudent position), and the hard rules in scoring-rules.ts already cover
 * the constraints that must hold.
 */
export function toScoringResult(entry: Record<string, unknown>): ScoringResult {
  const ruledOut = textOrNull(entry.ruled_out);
  const blocker = textOrNull(entry.blocker) ?? ruledOut;
  const matchScore = clampScore(entry.match_score);
  return {
    job_id: String(entry.job_id),
    match_score: ruledOut ? Math.min(matchScore, BLOCKED_MAX_SCORE) : matchScore,
    skill_overlap_pct: clampScore(entry.skill_overlap_pct),
    seniority_fit: clampScore(entry.seniority_fit),
    location_fit: clampScore(entry.location_fit),
    employment_fit: clampScore(entry.employment_fit),
    blocker,
    reasoning: String(entry.reasoning ?? ""),
  };
}

/**
 * Pull every balanced {...} out of a malformed response, at any nesting depth,
 * keeping only the ones that look like a score object and actually parse.
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

// Small chunks are the whole point: ~6 condensed descriptions is roughly 6k
// tokens, which comes back in seconds instead of grinding against the request
// timeout — and a chunk that does fail costs six jobs, not twenty-five.
export const CHUNK_SIZE = 6;

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Score a single bounded chunk of jobs (<= CHUNK_SIZE) in one AI call. */
export async function scoreChunk(
  jobs: DbJob[],
  preferences: Preferences,
  limits: CandidateLimits,
): Promise<ScoringResult[]> {
  // Low temperature: the same job should not drift between scores across runs.
  const text = await generateText(buildPrompt(jobs, preferences), { temperature: 0.2 });
  const parsed = parseScoringResponse(text);

  const validIds = new Set(jobs.map((j) => j.id));
  const seen = new Set<string>();

  return parsed
    .filter((entry) => {
      const id = String(entry.job_id);
      if (!validIds.has(id) || seen.has(id)) return false;
      // No score means no result: the job stays unscored and the next run
      // retries it, instead of silently landing at 0.
      if (entry.match_score == null || !Number.isFinite(Number(entry.match_score))) return false;
      seen.add(id);
      return true;
    })
    .map((entry) => {
      const job = jobs.find((j) => j.id === String(entry.job_id))!;
      const facts = readPostingFacts(entry, job.title);
      return applyHardRules(toScoringResult(entry), facts, preferences, limits);
    });
}

/**
 * Read the hard limits out of the candidate's free-text notes, once per run.
 * The scorer applies them in code (see scoring-rules.ts) — asked per chunk,
 * the model would weigh "no senior positions" against everything else and lose
 * it. A failed read falls back to no limits rather than failing the run; the
 * prompt still carries the notes.
 */
export async function extractCandidateLimits(notes: string | null): Promise<CandidateLimits> {
  if (!notes?.trim()) return NO_LIMITS;
  const prompt = `A job seeker described the jobs they want. Extract two hard limits from it.

- exclude_senior: true only if they say they do NOT want senior positions.
- max_required_years: the most years of REQUIRED professional experience they
  still accept — only when they state such a limit. "keine Stellen, die 3 oder
  mehr Jahre verlangen" → 2, "maximal 2 Jahre Erfahrung gefordert" → 2. Their own
  experience alone ("ich habe 1 Jahr Erfahrung") is NOT a limit → null.

Return ONLY JSON, no markdown: {"exclude_senior": false, "max_required_years": null}

Text:
"""
${notes}
"""`;
  try {
    const raw = await generateText(prompt, { temperature: 0, maxTokens: 200 });
    const parsed = JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    ) as Record<string, unknown>;
    const years = Number(parsed.max_required_years);
    return {
      excludeSenior: parsed.exclude_senior === true,
      maxRequiredYears:
        parsed.max_required_years != null && Number.isFinite(years) && years >= 0 ? years : null,
    };
  } catch (error) {
    console.error("Reading candidate limits failed, scoring without them:", error);
    return NO_LIMITS;
  }
}
