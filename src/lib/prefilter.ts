import type { DbJob, Settings, Profile } from "./types";

/**
 * Pre-filter jobs based on target titles and skills.
 * Returns job IDs that pass the filter.
 */
export function prefilterJobs(
  jobs: DbJob[],
  settings: Settings,
  profile: Profile
): string[] {
  if (!profile.skills || profile.skills.length === 0) {
    return [];
  }

  const passingJobs: string[] = [];

  for (const job of jobs) {
    const titleMatches = settings.target_titles.some((targetTitle) =>
      job.title.toLowerCase().includes(targetTitle.toLowerCase())
    );

    if (!titleMatches) continue;

    // Skill overlap: at least 30% of profile skills mentioned in the job description
    const jobDescLower = (job.description || "").toLowerCase();
    const matchedSkills = profile.skills.filter((skill) =>
      jobDescLower.includes(skill.toLowerCase())
    );
    const skillOverlapPct = (matchedSkills.length / profile.skills.length) * 100;

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
