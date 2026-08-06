import { getGeminiModel } from "@/lib/gemini";
import type { DbJob, Profile, Preferences } from "@/lib/types";

export interface ScoringResult {
  job_id: string;
  match_score: number;
  skill_overlap_pct: number;
  seniority_fit: number;
  location_fit: number;
  reasoning: string;
}

function buildPrompt(jobs: DbJob[], profile: Profile, preferences: Preferences): string {
  const allSkills = [
    ...profile.skills_frontend,
    ...profile.skills_backend,
    ...profile.skills_devops,
    ...profile.skills_soft,
    ...profile.skills_tools,
  ];

  return `You are an expert job fit evaluator. Score jobs for a candidate based on their profile and preferences.

Candidate profile:
- Name: ${profile.name ?? "Unknown"}
- Skills: ${allSkills.join(", ")}
- Current situation: ${profile.current_situation ?? "unspecified"}

Preferences:
- Target titles: ${preferences.target_titles.join(", ")}
- Desired seniority (0 = entry level, 10 = lead/principal): ${preferences.preferred_seniority}
- Location preference: ${preferences.preferred_location || "any"}
- Things to avoid (reject or heavily penalize jobs matching these): ${
    preferences.excluded_keywords.join(", ") || "none"
  }

For each job below, return four 0-100 scores plus one sentence of reasoning:
- skill_overlap_pct: how many target skills appear in the job description
- seniority_fit: how well the job's seniority matches the desired seniority
- location_fit: how well the job location/remote policy matches the location preference
- match_score: overall fit (weigh skills and seniority most heavily; score near 0 if the job matches something in "things to avoid")

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

/** Score a batch of jobs against a profile + preferences in a single AI call. */
export async function scoreJobsBatch(
  jobs: DbJob[],
  profile: Profile,
  preferences: Preferences,
  modelName?: string
): Promise<ScoringResult[]> {
  if (jobs.length === 0) return [];

  const model = getGeminiModel(modelName);
  const result = await model.generateContent(buildPrompt(jobs, profile, preferences));
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
