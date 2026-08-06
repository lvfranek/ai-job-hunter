import type { DbJob, Preferences, Profile } from "./types";

/**
 * Pre-filter jobs based on target titles (from Preferences) and skills (from Profile).
 * Returns job IDs that pass the filter.
 */
export function prefilterJobs(
  jobs: DbJob[],
  profile: Profile,
  preferences: Preferences
): string[] {
  const allSkills = [
    ...profile.skills_frontend,
    ...profile.skills_backend,
    ...profile.skills_devops,
    ...profile.skills_soft,
    ...profile.skills_tools,
  ];

  if (allSkills.length === 0) {
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

    const titleMatches = preferences.target_titles.some((targetTitle) =>
      jobTitleLower.includes(targetTitle.toLowerCase())
    );

    if (!titleMatches) continue;

    // Skill overlap: at least 30% of profile skills mentioned in the job description
    const matchedSkills = allSkills.filter((skill) =>
      jobDescLower.includes(skill.toLowerCase())
    );
    const skillOverlapPct = (matchedSkills.length / allSkills.length) * 100;

    if (skillOverlapPct >= 30) {
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
