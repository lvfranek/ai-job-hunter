import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { normalizeKeyword } from "@/lib/keyword-stats";

// Writes the raw data behind the Statistics page (migration 028): which keyword
// found which job, and what every board × keyword search returned. Called by the
// scrape pipeline after it has stored a run's jobs.

/** One board × keyword search: the job URLs it returned, or why it failed. */
export interface SearchResult {
  portal: string;
  keyword: string;
  urls: string[];
  /** The result limit the search ran with — returned >= cap means there was more. */
  resultCap: number | null;
  error: string | null;
}

export interface JobKeywordRow {
  job_id: string;
  keyword: string;
  scrape_run_id: string;
  discovered: boolean;
  first_seen_at: string;
}

export interface ScrapeSearchRow {
  scrape_run_id: string;
  keyword: string;
  portal: string;
  returned: number;
  new_jobs: number;
  result_cap: number | null;
  error: string | null;
}

/**
 * Turn one scrape run's searches into tracking rows. `jobIdByUrl` maps every URL
 * that has a job row (new or already known); `newUrls` are the ones this run
 * inserted. URLs without a job row (insert failed) are skipped.
 */
export function buildTrackingRows({
  runId,
  searches,
  jobIdByUrl,
  newUrls,
  seenAt,
}: {
  runId: string;
  searches: SearchResult[];
  jobIdByUrl: Map<string, string>;
  newUrls: Set<string>;
  seenAt: string;
}): { jobKeywords: JobKeywordRow[]; searches: ScrapeSearchRow[] } {
  const jobKeywords = new Map<string, JobKeywordRow>();
  const searchRows = new Map<string, ScrapeSearchRow>();

  for (const search of searches) {
    const keyword = normalizeKeyword(search.keyword);
    if (!keyword) continue;

    let newJobs = 0;
    for (const url of new Set(search.urls)) {
      const jobId = jobIdByUrl.get(url);
      if (!jobId) continue;
      const isNew = newUrls.has(url);
      if (isNew) newJobs++;
      const key = `${jobId}|${keyword}`;
      if (!jobKeywords.has(key)) {
        jobKeywords.set(key, {
          job_id: jobId,
          keyword,
          scrape_run_id: runId,
          discovered: isNew,
          first_seen_at: seenAt,
        });
      }
    }

    // Two settings entries can normalize to the same keyword — merge them.
    const searchKey = `${search.portal}|${keyword}`;
    const prev = searchRows.get(searchKey);
    searchRows.set(searchKey, {
      scrape_run_id: runId,
      keyword,
      portal: search.portal,
      returned: (prev?.returned ?? 0) + search.urls.length,
      new_jobs: (prev?.new_jobs ?? 0) + newJobs,
      result_cap: prev?.result_cap ?? search.resultCap,
      error: prev?.error ?? search.error,
    });
  }

  return { jobKeywords: [...jobKeywords.values()], searches: [...searchRows.values()] };
}

const BATCH_SIZE = 500;

/** Upsert tracking rows in batches. Existing rows win, so a job keeps its first sighting. */
export async function saveTrackingRows(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  rows: { jobKeywords: JobKeywordRow[]; searches: ScrapeSearchRow[] },
): Promise<void> {
  for (let i = 0; i < rows.jobKeywords.length; i += BATCH_SIZE) {
    const { error } = await supabase.from("job_keywords").upsert(
      rows.jobKeywords.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, user_id: CURRENT_USER_ID })),
      { onConflict: "job_id,keyword", ignoreDuplicates: true },
    );
    if (error) throw new Error(`Saving job_keywords failed: ${error.message}`);
  }
  for (let i = 0; i < rows.searches.length; i += BATCH_SIZE) {
    const { error } = await supabase.from("scrape_searches").upsert(
      rows.searches.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, user_id: CURRENT_USER_ID })),
      { onConflict: "scrape_run_id,keyword,portal", ignoreDuplicates: true },
    );
    if (error) throw new Error(`Saving scrape_searches failed: ${error.message}`);
  }
}
