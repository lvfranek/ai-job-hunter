import { getGeminiModel } from "@/lib/gemini";
import { normalizeBlockText } from "@/lib/text-format";
import type { DbJob, Preferences } from "@/lib/types";

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

// German job postings run 4-12k characters, most of it benefits boilerplate,
// legal text and company blurb after the actual requirements. Sending them whole
// put ~50k tokens in every request, which is what made runs slow enough to trip
// the 90s client timeout and lose a whole chunk at a time.
const MAX_DESCRIPTION_CHARS = 3000;

export function condenseDescription(text: string | null): string {
  if (!text) return "(keine Beschreibung verfügbar)";
  // Keep the line structure. Collapsing it away costs almost no tokens to
  // retain (the old `\s+` mostly ate indentation) and headings like
  // "Dein Profil" / "Deine Aufgaben" are exactly how the model tells real
  // requirements apart from benefits boilerplate.
  const collapsed = normalizeBlockText(text);
  if (collapsed.length <= MAX_DESCRIPTION_CHARS) return collapsed;
  return `${collapsed.slice(0, MAX_DESCRIPTION_CHARS)} …[gekürzt]`;
}

const EMPLOYMENT_LABELS: Record<string, string> = {
  freelance: "Freelance / freiberuflich",
  ausbildung: "Ausbildung",
  studium: "duales Studium / Studium",
  werkstudent: "Werkstudent",
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
    EMPLOYMENT_LABELS
  );
  const workTime = labelList(preferences.work_time_models ?? [], WORK_TIME_LABELS);
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

## The candidate

What they want, in their own words — this is your PRIMARY signal, including
anything they explicitly say to avoid:
"""
${preferences.notes || "No specific preferences given."}
"""

Skills they actually have: ${preferences.own_skills || "not specified"}
Programming languages they'd prefer to work in: ${preferences.preferred_languages || "no preference"}
Preferred location: ${preferences.preferred_location || "any"}
Work arrangement: ${preferences.job_type?.join(", ") || "any"}
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
- Location is unreachable and the posting offers no remote option, while the
  candidate needs remote or a different region.
- A completed degree or Ausbildung is MANDATORY and the candidate does not have it.
- A language is MANDATORY that the candidate does not speak.
- The posting's contract form appears on the candidate's exclusion list above
  (e.g. it is a Werkstudentenstelle and they excluded Werkstudent).
- The posting is explicitly senior-only ("mindestens 5 Jahre Berufserfahrung
  zwingend", "nur für erfahrene …").
If none of these apply, "blocker" MUST be null and the score MUST be 35 or above.

## What must NOT sink a score
- "2-3 Jahre Berufserfahrung" for an early-career candidate: moderate deduction
  only, never a blocker. German employers routinely hire under specification.
- A stack the candidate hasn't used but that is adjacent to what they know
  (React ↔ Vue ↔ Angular, Node ↔ Python ↔ PHP, MySQL ↔ Postgres): small
  deduction only — these transfer.
- Anything listed under "Nice to have" / "Von Vorteil" / "Wünschenswert": no
  deduction at all.
- A long wish list of technologies: judge the CORE requirements, not the wish list.

## Output
For every job return these fields:
- skill_overlap_pct (0-100): how well the required tech matches the candidate's
  skills and the stack they described wanting.
- seniority_fit (0-100): how well the required experience level matches. Apply
  the "must not sink a score" rule above.
- location_fit (0-100): location and remote policy vs. the candidate's preference.
- employment_fit (0-100): 0 if the posting's contract form is on the exclusion
  list above — that is a blocker. Otherwise judge the working-time model against
  the candidate's accepted list, and return 100 if they stated no preference.
- blocker: short German phrase naming the hard blocker, or null. Null unless the
  score is under 35.
- reasoning: 1-2 concrete sentences IN GERMAN. Name the specific technology or
  aspect that matches AND the one thing that doesn't. No generic filler.
- match_score (0-100): the overall band from the scale above. Weight skills
  heaviest, then employment/location fit, then seniority.

Return ONLY a valid JSON array — no markdown fences, no commentary:
[
  {
    "job_id": "uuid",
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
  }))
)}`;
}

function clampScore(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
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

/** The OpenRouter model the scorer will actually use, for progress reporting. */
export async function getScoringModelName(): Promise<string> {
  return (await getGeminiModel()).name;
}

/** Score a single bounded chunk of jobs (<= CHUNK_SIZE) in one AI call. */
export async function scoreChunk(
  jobs: DbJob[],
  preferences: Preferences,
  modelName?: string
): Promise<ScoringResult[]> {
  // Low temperature: the same job should not drift between scores across runs.
  const model = await getGeminiModel(modelName, { temperature: 0.2 });
  const result = await model.generateContent(buildPrompt(jobs, preferences));
  const parsed = parseScoringResponse(result.response.text());

  const validIds = new Set(jobs.map((j) => j.id));
  const seen = new Set<string>();

  return parsed
    .filter((entry) => {
      const id = String(entry.job_id);
      if (!validIds.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((entry) => {
      const blocker = typeof entry.blocker === "string" ? entry.blocker.trim() : "";
      return {
        job_id: String(entry.job_id),
        match_score: clampScore(entry.match_score),
        skill_overlap_pct: clampScore(entry.skill_overlap_pct),
        seniority_fit: clampScore(entry.seniority_fit),
        location_fit: clampScore(entry.location_fit),
        employment_fit: clampScore(entry.employment_fit),
        blocker: blocker && blocker.toLowerCase() !== "null" ? blocker : null,
        reasoning: String(entry.reasoning ?? ""),
      };
    });
}
