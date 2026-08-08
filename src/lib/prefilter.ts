import type { DbJob, Preferences, Profile } from "./types";

const STOPWORDS = new Set([
  "and", "or", "the", "a", "an", "of", "for", "in", "at", "to", "with",
  "und", "oder", "der", "die", "das", "für", "mit", "bei",
]);

function significantWords(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-zäöüß0-9]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

/**
 * Pre-filter jobs based on target titles (from Preferences) and skills (from Profile).
 * Returns job IDs that pass the filter.
 */
export function prefilterJobs(
  jobs: DbJob[],
  profile: Profile,
  preferences: Preferences
): string[] {
  // "Tools" (PowerPoint, Slack, Loom, ...) rarely appear verbatim in a job posting
  // and dilute the overlap % without being a real technical-fit signal — only count
  // the technical categories here. (The AI scorer still sees the full skill list.)
  const technicalSkills = [
    ...profile.skills_frontend,
    ...profile.skills_backend,
    ...profile.skills_devops,
  ];

  if (technicalSkills.length === 0) {
    return [];
  }

  const passingJobs: string[] = [];

  for (const job of jobs) {
    const jobDescLower = (job.description || "").toLowerCase();
    const jobTitleLower = job.title.toLowerCase();

    const isExcluded = preferences.excluded_keywords.some(
      (keyword) =>
        jobTitleLower.includes(keyword.toLowerCase()) ||
        jobDescLower.includes(keyword.toLowerCase())
    );
    if (isExcluded) continue;

    // Loose match: any significant word from a target title shows up in the job title.
    // (Real postings almost never contain a full target phrase verbatim.)
    const titleMatches = preferences.target_titles.some((targetTitle) =>
      significantWords(targetTitle).some((word) => jobTitleLower.includes(word))
    );

    if (!titleMatches) continue;

    // Skill overlap: at least 15% of technical skills mentioned in the job description.
    // This is just a cheap pre-cut before spending AI credits on scoring — the title
    // match already did the heavy lifting, so this stays loose on purpose.
    const matchedSkills = technicalSkills.filter((skill) =>
      jobDescLower.includes(skill.toLowerCase())
    );
    const skillOverlapPct = (matchedSkills.length / technicalSkills.length) * 100;

    if (skillOverlapPct >= 15) {
      passingJobs.push(job.id);
    }
  }

  return passingJobs;
}

/**
 * Deduplicate jobs by URL. Returns array of unique job URLs.
 */
export function deduplicateJobs(jobs: DbJob[]): string[] {
  return Array.from(new Set(jobs.map((job) => job.url)));
}

/**
 * Check if a job URL already exists in the database.
 */
export async function isJobDuplicate(
  url: string,
  supabaseClient: ReturnType<typeof import("./supabase").getSupabaseServerClient>
): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from("jobs")
    .select("id")
    .eq("url", url)
    .limit(1);

  if (error) {
    console.error("Error checking duplicate:", error);
    return false;
  }

  return Boolean(data && data.length > 0);
}
