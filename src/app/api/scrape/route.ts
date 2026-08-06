import { NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { triggerApifyScraper, pollApifyRun, buildIndeedInputs, mapIndeedJob } from "@/lib/apify";
import { prefilterJobs, isJobDuplicate } from "@/lib/prefilter";
import { scoreJobsBatch } from "@/lib/agents/agent-3";
import type { DbJob, Profile, Preferences, Settings } from "@/lib/types";

const INDEED_ACTOR_ID = process.env.APIFY_SCRAPER_INDEED || "";

export async function POST() {
  const supabase = getSupabaseServerClient();

  const [{ data: settings }, { data: profile }, { data: preferences }] = await Promise.all([
    supabase.from("settings").select("*").eq("user_id", CURRENT_USER_ID).single(),
    supabase.from("profiles").select("*").eq("user_id", CURRENT_USER_ID).single(),
    supabase.from("preferences").select("*").eq("user_id", CURRENT_USER_ID).single(),
  ]);

  if (!settings || !settings.scraper_search_keywords?.length) {
    return NextResponse.json(
      { error: "Add search keywords in Settings first" },
      { status: 400 }
    );
  }
  if (!profile || !preferences) {
    return NextResponse.json(
      { error: "Complete your profile and preferences first" },
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
  runScrapePipeline(
    runData.id,
    settings as Settings,
    profile as Profile,
    preferences as Preferences
  ).catch((err) => console.error("Scrape pipeline failed:", err));

  return NextResponse.json({ runId: runData.id });
}

async function runScrapePipeline(
  runId: string,
  settings: Settings,
  profile: Profile,
  preferences: Preferences
) {
  const supabase = getSupabaseServerClient();

  try {
    const apifyRunId = await triggerApifyScraper(INDEED_ACTOR_ID, buildIndeedInputs(settings));
    const rawJobs = await pollApifyRun(apifyRunId);

    await supabase.from("scrape_runs").update({ total_scraped: rawJobs.length }).eq("id", runId);

    const candidates: DbJob[] = rawJobs.map((raw) => {
      const mapped = mapIndeedJob(raw);
      return {
        ...mapped,
        id: mapped.url,
        user_id: CURRENT_USER_ID,
        created_at: "",
        deleted_at: null,
      } as DbJob;
    });

    const passingUrls = new Set(prefilterJobs(candidates, profile, preferences));
    const filtered = candidates.filter((c) => passingUrls.has(c.id));

    await supabase
      .from("scrape_runs")
      .update({ passed_prefilter: filtered.length })
      .eq("id", runId);

    let duplicates = 0;
    const stored: DbJob[] = [];
    for (const job of filtered) {
      const isDup = await isJobDuplicate(job.url, supabase);
      if (isDup) {
        duplicates++;
        continue;
      }
      const { data, error } = await supabase
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
        .select()
        .single();
      if (!error && data) stored.push(data as DbJob);
    }

    let scored = 0;
    if (stored.length > 0) {
      try {
        const results = await scoreJobsBatch(stored, profile, preferences);
        const { error } = await supabase
          .from("job_matches")
          .upsert(
            results.map((r) => ({ ...r, user_id: CURRENT_USER_ID })),
            { onConflict: "job_id" }
          );
        if (!error) scored = results.length;
      } catch (err) {
        // Don't fail the whole scrape if scoring errors — jobs stay unscored,
        // user can retry via POST /api/score.
        console.error("Scoring failed after scrape:", err);
      }
    }

    await supabase
      .from("scrape_runs")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        scored,
        duplicates_found: duplicates,
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
