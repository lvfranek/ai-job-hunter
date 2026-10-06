import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import {
  triggerApifyScraper,
  pollApifyRun,
  buildIndeedInputs,
  mapIndeedJob,
  buildLinkedinInputs,
  mapLinkedinJob,
  buildStepstoneInputs,
  mapStepstoneJob,
  buildXingInputs,
  mapXingJob,
  buildArbeitsagenturInputs,
  mapArbeitsagenturJob,
  type ApifyRunInput,
  type ScrapedJob,
} from "@/lib/apify";
import { runWithConcurrency } from "@/lib/pipeline/concurrency";
import {
  buildTrackingRows,
  saveTrackingRows,
  type SearchResult,
} from "@/lib/pipeline/keyword-tracking";
import { getCredential } from "@/lib/credentials";
import type { DbJob, Settings } from "@/lib/types";

type Portal = "indeed" | "linkedin" | "stepstone" | "xing" | "arbeitsagentur";

const PORTAL_DEFS: Record<
  Portal,
  {
    buildInput: (settings: Settings, keyword: string) => ApifyRunInput;
    mapJob: (raw: unknown) => ScrapedJob;
  }
> = {
  indeed: { buildInput: buildIndeedInputs, mapJob: mapIndeedJob },
  linkedin: { buildInput: buildLinkedinInputs, mapJob: mapLinkedinJob },
  stepstone: { buildInput: buildStepstoneInputs, mapJob: mapStepstoneJob },
  xing: { buildInput: buildXingInputs, mapJob: mapXingJob },
  arbeitsagentur: { buildInput: buildArbeitsagenturInputs, mapJob: mapArbeitsagenturJob },
};

// The portals expect ONE keyword per search — "kw1 OR kw2 OR kw3" returns
// nothing on most of them. So a scrape fans out to one Apify run per active
// board × per keyword. This caps how many run at once (25 boards×keywords is
// realistic) to avoid hammering Apify and stacking 25 concurrent 5-minute polls.
const SCRAPE_CONCURRENCY = 4;

// A 'running' scrape_run with no heartbeat for this long has lost its worker
// (crashed/frozen invocation, killed dev process). Mirrors STALE_RUN_MS in
// run-score.ts. One round is up to 4 Apify runs of ~5min each, so keep it loose.
const STALE_RUN_MS = 8 * 60 * 1000;

async function buildPortalScrapers() {
  const actorIds = await Promise.all([
    getCredential("apify_scraper_indeed"),
    getCredential("apify_scraper_linkedin"),
    getCredential("apify_scraper_stepstone"),
    getCredential("apify_scraper_xing"),
    getCredential("apify_scraper_arbeitsagentur"),
  ]);
  const portals: Portal[] = ["indeed", "linkedin", "stepstone", "xing", "arbeitsagentur"];
  return Object.fromEntries(
    portals.map((portal, i) => [portal, { ...PORTAL_DEFS[portal], actorId: actorIds[i] }]),
  ) as Record<Portal, (typeof PORTAL_DEFS)[Portal] & { actorId: string }>;
}

export interface ScrapePipelineResult {
  scraped: number;
  stored: number;
  duplicates: number;
}

/**
 * Mark any of this user's scrape_runs that are stuck in 'running' with a stale
 * heartbeat as 'failed'. Safe to call before starting a new run and on every
 * status poll. Returns the ids it reaped.
 */
export async function failStaleScrapeRuns(
  supabase: ReturnType<typeof getSupabaseServerClient>,
): Promise<string[]> {
  const cutoff = new Date(Date.now() - STALE_RUN_MS).toISOString();
  const { data, error } = await supabase
    .from("scrape_runs")
    .update({
      status: "failed",
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      errors: { message: "Run stalled — no progress heartbeat" },
    })
    .eq("user_id", CURRENT_USER_ID)
    .eq("status", "running")
    .lt("updated_at", cutoff)
    .select("id");

  if (error) {
    console.error("failStaleScrapeRuns failed:", error);
    return [];
  }
  return (data ?? []).map((r) => r.id as string);
}

// Supabase chokes on very large `.in(...)` lists; look up known URLs in batches.
// Returns url → job id for every URL that already has a job row.
async function findExistingJobIds(
  urls: string[],
  supabase: ReturnType<typeof getSupabaseServerClient>,
): Promise<Map<string, string>> {
  const known = new Map<string, string>();
  for (let i = 0; i < urls.length; i += 200) {
    const batch = urls.slice(i, i + 200);
    const { data, error } = await supabase.from("jobs").select("id, url").in("url", batch);
    if (error) {
      console.error("findExistingJobIds batch failed:", error);
      continue;
    }
    for (const row of (data ?? []) as { id: string; url: string }[]) known.set(row.url, row.id);
  }
  return known;
}

// Scrape only fetches and stores jobs — scoring is a separate step (see run-score.ts),
// so a scrape failure or a scoring failure never take each other down.
export async function runScrapePipeline(
  runId: string,
  settings: Settings,
): Promise<ScrapePipelineResult> {
  const supabase = getSupabaseServerClient();

  const heartbeat = async (fields: Record<string, unknown> = {}) => {
    try {
      await supabase
        .from("scrape_runs")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", runId);
    } catch (error) {
      console.error("scrape_runs heartbeat failed:", error);
    }
  };

  try {
    const [apiKey, portalScrapers] = await Promise.all([
      getCredential("apify_api_key"),
      buildPortalScrapers(),
    ]);

    const portals = (Object.keys(portalScrapers) as Portal[]).filter(
      (portal) => settings.portal_toggles[portal] && portalScrapers[portal].actorId,
    );

    const keywords = (settings.scraper_search_keywords ?? []).map((k) => k.trim()).filter(Boolean);

    // One task = one board searched for one keyword = one Apify run.
    const tasks = portals.flatMap((portal) => keywords.map((keyword) => ({ portal, keyword })));

    await heartbeat({ total_runs: tasks.length, completed_runs: 0, total_scraped: 0 });

    // One board/keyword failing (bad actor input, rate limit, etc.) shouldn't
    // lose the jobs the other tasks already found — errors are collected, not thrown.
    let completed = 0;
    let totalFound = 0;
    const portalCounts: Record<string, number> = {};
    const scraped: ScrapedJob[] = [];
    const taskErrors: Record<string, string> = {};
    // Per-search results for the Statistics page — which keyword found what.
    const searchResults: SearchResult[] = [];
    const resultCap = Number(settings.scraper_results_per_scan) || null;

    await runWithConcurrency(tasks, SCRAPE_CONCURRENCY, async ({ portal, keyword }) => {
      const { actorId, buildInput, mapJob } = portalScrapers[portal];
      try {
        const apifyRunId = await triggerApifyScraper(
          actorId,
          buildInput(settings, keyword),
          apiKey,
        );
        const rawJobs = await pollApifyRun(apifyRunId, apiKey);
        const mapped = rawJobs.map(mapJob);
        scraped.push(...mapped);
        searchResults.push({
          portal,
          keyword,
          urls: mapped.map((job) => job.url),
          resultCap,
          error: null,
        });
        portalCounts[portal] = (portalCounts[portal] ?? 0) + mapped.length;
        totalFound += mapped.length;
      } catch (reason) {
        taskErrors[`${portal}:${keyword}`] = String(reason);
        searchResults.push({ portal, keyword, urls: [], resultCap, error: String(reason) });
        console.error(`Scraping ${portal} for "${keyword}" failed:`, reason);
      } finally {
        // Count the task as done either way so "board N of M" always completes.
        completed += 1;
        await heartbeat({
          completed_runs: completed,
          total_scraped: totalFound,
          portal_counts: portalCounts,
        });
      }
    });

    // The same listing is found by several keywords on the same board — collapse
    // by URL before touching the DB (first occurrence wins).
    const seen = new Set<string>();
    const uniqueJobs = scraped.filter((job) => {
      if (!job.url || seen.has(job.url)) return false;
      seen.add(job.url);
      return true;
    });

    // Scraped listings always have a URL; only manual applications can lack one.
    const candidates: (DbJob & { url: string })[] = uniqueJobs.map((mapped) => ({
      ...mapped,
      id: mapped.url,
      user_id: CURRENT_USER_ID,
      status: null,
      applied_at: null,
      salary: null,
      created_at: "",
      deleted_at: null,
    }));

    await heartbeat({ passed_prefilter: candidates.length });

    // url → job id: listings we already have, plus every one inserted below.
    const jobIds = await findExistingJobIds(
      candidates.map((c) => c.url),
      supabase,
    );
    const newUrls = new Set<string>();

    // Same listing returned by multiple keywords/boards this run + listings we
    // already have from a previous run.
    let duplicates = scraped.length - uniqueJobs.length;
    let stored = 0;
    for (const job of candidates) {
      if (jobIds.has(job.url)) {
        duplicates++;
        continue;
      }
      const { data: inserted, error } = await supabase
        .from("jobs")
        .insert({
          user_id: CURRENT_USER_ID,
          url: job.url,
          title: job.title,
          company: job.company,
          description: job.description,
          platform: job.platform,
          posted_date: job.posted_date,
        })
        .select("id")
        .single();
      if (!error && inserted) {
        stored++;
        jobIds.set(job.url, inserted.id as string); // guard against a dup within this same batch
        newUrls.add(job.url);
      }
    }

    // Keyword statistics are a nice-to-have — a failure here (e.g. migration
    // 028 not applied yet) must never fail the scrape itself.
    try {
      await saveTrackingRows(
        supabase,
        buildTrackingRows({
          runId,
          searches: searchResults,
          jobIdByUrl: jobIds,
          newUrls,
          seenAt: new Date().toISOString(),
        }),
      );
    } catch (error) {
      console.error("Saving keyword statistics failed:", error);
    }

    await supabase
      .from("scrape_runs")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // "scored" predates the scrape/score split — repurposed here as "newly stored" count.
        scored: stored,
        duplicates_found: duplicates,
        errors: Object.keys(taskErrors).length > 0 ? taskErrors : null,
      })
      .eq("id", runId);

    return { scraped: scraped.length, stored, duplicates };
  } catch (error) {
    await supabase
      .from("scrape_runs")
      .update({
        status: "failed",
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        errors: { message: String(error) },
      })
      .eq("id", runId);
    throw error;
  }
}
