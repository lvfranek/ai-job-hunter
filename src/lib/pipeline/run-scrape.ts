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
import { isJobDuplicate } from "@/lib/prefilter";
import { getCredential } from "@/lib/credentials";
import type { DbJob, Settings } from "@/lib/types";

type Portal = "indeed" | "linkedin" | "stepstone" | "xing" | "arbeitsagentur";

const PORTAL_DEFS: Record<
  Portal,
  {
    buildInput: (settings: Settings) => ApifyRunInput;
    mapJob: (raw: unknown) => ScrapedJob;
  }
> = {
  indeed: { buildInput: buildIndeedInputs, mapJob: mapIndeedJob },
  linkedin: { buildInput: buildLinkedinInputs, mapJob: mapLinkedinJob },
  stepstone: { buildInput: buildStepstoneInputs, mapJob: mapStepstoneJob },
  xing: { buildInput: buildXingInputs, mapJob: mapXingJob },
  arbeitsagentur: { buildInput: buildArbeitsagenturInputs, mapJob: mapArbeitsagenturJob },
};

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
    portals.map((portal, i) => [portal, { ...PORTAL_DEFS[portal], actorId: actorIds[i] }])
  ) as Record<Portal, (typeof PORTAL_DEFS)[Portal] & { actorId: string }>;
}

export interface ScrapePipelineResult {
  scraped: number;
  stored: number;
  duplicates: number;
}

// Scrape only fetches and stores jobs — scoring is a separate step (see run-score.ts),
// so a scrape failure or a scoring failure never take each other down.
export async function runScrapePipeline(
  runId: string,
  settings: Settings
): Promise<ScrapePipelineResult> {
  const supabase = getSupabaseServerClient();

  try {
    const [apiKey, portalScrapers] = await Promise.all([
      getCredential("apify_api_key"),
      buildPortalScrapers(),
    ]);

    const portals = (Object.keys(portalScrapers) as Portal[]).filter(
      (portal) => settings.portal_toggles[portal] && portalScrapers[portal].actorId
    );

    const results = await Promise.allSettled(
      portals.map(async (portal) => {
        const { actorId, buildInput, mapJob } = portalScrapers[portal];
        const apifyRunId = await triggerApifyScraper(actorId, buildInput(settings), apiKey);
        const rawJobs = await pollApifyRun(apifyRunId, apiKey);
        return rawJobs.map(mapJob);
      })
    );

    // One portal failing (bad actor input, rate limit, etc.) shouldn't lose the
    // jobs the other portals already found.
    const scraped: ScrapedJob[] = [];
    const portalCounts: Record<string, number> = {};
    const portalErrors: Record<string, string> = {};
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        scraped.push(...result.value);
        portalCounts[portals[i]] = result.value.length;
      } else {
        portalErrors[portals[i]] = String(result.reason);
        console.error(`Scraping ${portals[i]} failed:`, result.reason);
      }
    });

    await supabase
      .from("scrape_runs")
      .update({ total_scraped: scraped.length, portal_counts: portalCounts })
      .eq("id", runId);

    const candidates: DbJob[] = scraped.map((mapped) => ({
      ...mapped,
      id: mapped.url,
      user_id: CURRENT_USER_ID,
      status: null,
      created_at: "",
      deleted_at: null,
    }));

    // No pre-filtering — every scraped job is stored. Scoring happens separately.
    await supabase
      .from("scrape_runs")
      .update({ passed_prefilter: candidates.length })
      .eq("id", runId);

    let duplicates = 0;
    let stored = 0;
    for (const job of candidates) {
      const isDup = await isJobDuplicate(job.url, supabase);
      if (isDup) {
        duplicates++;
        continue;
      }
      const { error } = await supabase.from("jobs").insert({
        user_id: CURRENT_USER_ID,
        url: job.url,
        title: job.title,
        company: job.company,
        description: job.description,
        platform: job.platform,
        posted_date: job.posted_date,
      });
      if (!error) stored++;
    }

    await supabase
      .from("scrape_runs")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        // "scored" predates the scrape/score split — repurposed here as "newly stored" count.
        scored: stored,
        duplicates_found: duplicates,
        errors: Object.keys(portalErrors).length > 0 ? portalErrors : null,
      })
      .eq("id", runId);

    return { scraped: scraped.length, stored, duplicates };
  } catch (error) {
    await supabase
      .from("scrape_runs")
      .update({
        status: "failed",
        ended_at: new Date().toISOString(),
        errors: { message: String(error) },
      })
      .eq("id", runId);
    throw error;
  }
}
