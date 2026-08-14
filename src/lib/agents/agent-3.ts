import { getGeminiModel } from "@/lib/gemini";
import type { DbJob, Preferences } from "@/lib/types";

export interface ScoringResult {
  job_id: string;
  match_score: number;
  skill_overlap_pct: number;
  seniority_fit: number;
  location_fit: number;
  reasoning: string;
}

function buildPrompt(jobs: DbJob[], preferences: Preferences): string {
  return `You are an expert job fit evaluator. Score jobs for a candidate based on what they're looking for.

What the candidate wants (their own words — this is the primary signal, including anything
they explicitly say to avoid):
"""
${preferences.notes || "No specific preferences given."}
"""

Structured preferences:
- Desired seniority (0 = entry level, 10 = lead/principal): ${preferences.preferred_seniority}
- Location preference: ${preferences.preferred_location || "any"}
- Job type: ${preferences.job_type.join(", ") || "any"}

For each job below, return four 0-100 scores plus one sentence of reasoning:
- skill_overlap_pct: how well the job's required skills/tech match what the candidate described wanting to work with
- seniority_fit: how well the job's seniority matches the desired seniority
- location_fit: how well the job location/remote policy matches the location and job-type preference
- match_score: overall fit (weigh skills and seniority most heavily; score near 0 if the job matches something the candidate said to avoid)

Return ONLY a valid JSON array, no markdown, no explanations:
[
  { "job_id": "uuid", "match_score": 87, "skill_overlap_pct": 90, "seniority_fit": 100, "location_fit": 60, "reasoning": "Matches React + Node.js, senior level, hybrid Berlin" }
]

Jobs to score:
${JSON.stringify(jobs.map((j) => ({ id: j.id, title: j.title, company: j.company, description: j.description })))}`;
}

function clampScore(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

// A single call with hundreds of full job descriptions embedded risks blowing
// past the model's context window (or just getting slow/expensive) once scraping
// pulls from multiple job boards at once. Chunking keeps each call bounded.
// Preferences text is re-sent with every chunk (each call is stateless) but at
// a few hundred tokens against a chunk's ~20k tokens of job descriptions, that
// repetition is a rounding error, not the cost driver.
export const CHUNK_SIZE = 25;

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Score a single bounded chunk of jobs (<= CHUNK_SIZE) in one AI call. */
export async function scoreChunk(
  jobs: DbJob[],
  preferences: Preferences,
  modelName?: string
): Promise<ScoringResult[]> {
  const model = await getGeminiModel(modelName);
  const result = await model.generateContent(buildPrompt(jobs, preferences));
  const raw = result.response.text().trim();
  const json = raw.replace(/^```(?:json)?\s*|\s*```$/g, "");
  const parsed = JSON.parse(json) as Array<Record<string, unknown>>;

  const validIds = new Set(jobs.map((j) => j.id));

  return parsed
    .filter((entry) => validIds.has(String(entry.job_id)))
    .map((entry) => ({
      job_id: String(entry.job_id),
      match_score: clampScore(entry.match_score),
      skill_overlap_pct: clampScore(entry.skill_overlap_pct),
      seniority_fit: clampScore(entry.seniority_fit),
      location_fit: clampScore(entry.location_fit),
      reasoning: String(entry.reasoning ?? ""),
    }));
}
