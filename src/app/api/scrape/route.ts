import { NextResponse } from "next/server";
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
import type { DbJob, Settings } from "@/lib/types";

const PORTAL_SCRAPERS: Record<
  "indeed" | "linkedin" | "stepstone" | "xing" | "arbeitsagentur",
  {
    actorId: string;
    buildInput: (settings: Settings) => ApifyRunInput;
    mapJob: (raw: unknown) => ScrapedJob;
  }
> = {
  indeed: {
    actorId: process.env.APIFY_SCRAPER_INDEED || "",
    buildInput: buildIndeedInputs,
    mapJob: mapIndeedJob,
  },
  linkedin: {
    actorId: process.env.APIFY_SCRAPER_LINKEDIN || "",
    buildInput: buildLinkedinInputs,
    mapJob: mapLinkedinJob,
  },
  stepstone: {
    actorId: process.env.APIFY_SCRAPER_STEPSTONE || "",
    buildInput: buildStepstoneInputs,
    mapJob: mapStepstoneJob,
  },
  xing: {
    actorId: process.env.APIFY_SCRAPER_XING || "",
    buildInput: buildXingInputs,
    mapJob: mapXingJob,
  },
  arbeitsagentur: {
    actorId: process.env.APIFY_SCRAPER_ARBEITSAGENTUR || "",
    buildInput: buildArbeitsagenturInputs,
    mapJob: mapArbeitsagenturJob,
  },
};

export async function POST() {
  const supabase = getSupabaseServerClient();

  const { data: settings } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", CURRENT_USER_ID)
    .single();

  if (!settings || !settings.scraper_search_keywords?.length) {
    return NextResponse.json(
      { error: "Add search keywords in Settings first" },
      { status: 400 }
    );
  }

  const { data: runData, error: runError } = await supabase
    .from("scrape_runs")
    .insert({ user_id: CURRENT_USER_ID, status: "running" })
    .select()
    .single();

  if (runError) {
    return NextResponse.json({ error: String(runError) }, { status: 500 });
  }

  // ponytail: fire-and-forget background run — fine for this single-process local
  // app; would need a real job queue if this ever runs on serverless/multi-instance hosting.
  runScrapePipeline(runData.id, settings as Settings).catch((err) =>
    console.error("Scrape pipeline failed:", err)
  );

  return NextResponse.json({ runId: runData.id });
}

// Scrape only fetches and stores jobs — scoring is a separate step, triggered by
// the user via POST /api/score, so it never blocks or fails the scrape itself.
async function runScrapePipeline(runId: string, settings: Settings) {
  const supabase = getSupabaseServerClient();

  try {
    const portals = (Object.keys(PORTAL_SCRAPERS) as (keyof typeof PORTAL_SCRAPERS)[]).filter(
      (portal) => settings.portal_toggles[portal] && PORTAL_SCRAPERS[portal].actorId
    );

    const results = await Promise.allSettled(
      portals.map(async (portal) => {
        const { actorId, buildInput, mapJob } = PORTAL_SCRAPERS[portal];
        const apifyRunId = await triggerApifyScraper(actorId, buildInput(settings));
        const rawJobs = await pollApifyRun(apifyRunId);
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
      created_at: "",
      deleted_at: null,
    }));

    // No pre-filtering — every scraped job is stored. Scoring happens separately,
    // triggered by the user via the "Score" button (POST /api/score).
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
  } catch (error) {
    await supabase
      .from("scrape_runs")
      .update({
        status: "failed",
        ended_at: new Date().toISOString(),
        errors: { message: String(error) },
      })
      .eq("id", runId);
  }
}
