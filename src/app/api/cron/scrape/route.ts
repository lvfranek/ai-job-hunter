import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { isValidCronToken } from "@/lib/auth";
import { runScrapePipeline } from "@/lib/pipeline/run-scrape";
import { getJobsNeedingScoring, runScorePipeline } from "@/lib/pipeline/run-score";
import { notifyNewJobs } from "@/lib/notify";
import type { Settings } from "@/lib/types";

// For external schedulers (cron, n8n, Zapier, ...) — unlike POST /api/scrape (fire-and-forget,
// for the UI button), this awaits the full scrape + score + notify pipeline before responding,
// since the caller needs to know the outcome.
export async function POST(request: NextRequest) {
  if (!isValidCronToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  let scraped = 0;
  let stored = 0;
  try {
    const result = await runScrapePipeline(runData.id, settings as Settings);
    scraped = result.scraped;
    stored = result.stored;
  } catch (error) {
    return NextResponse.json({ error: `Scrape failed: ${String(error)}` }, { status: 500 });
  }

  // A scoring failure (e.g. missing preferences, AI provider hiccup) shouldn't hide
  // an otherwise-successful scrape result — log it and report jobsScored: 0.
  let jobsScored = 0;
  try {
    const { jobs: needsScoring, preferences } = await getJobsNeedingScoring(supabase);
    if (preferences && needsScoring.length > 0) {
      const { data: scoreRun, error: scoreRunError } = await supabase
        .from("score_runs")
        .insert({ user_id: CURRENT_USER_ID, status: "running", total: needsScoring.length })
        .select()
        .single();
      if (scoreRunError) throw scoreRunError;
      const result = await runScorePipeline(scoreRun.id, needsScoring, preferences);
      jobsScored = result.scored;
    }
  } catch (error) {
    console.error("Cron score step failed:", error);
  }

  const notified = await notifyNewJobs();

  return NextResponse.json({
    runId: runData.id,
    jobsFound: scraped,
    jobsStored: stored,
    jobsScored,
    notified,
  });
}
