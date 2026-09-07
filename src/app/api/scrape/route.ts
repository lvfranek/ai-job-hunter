import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { isDemoRequest } from "@/lib/auth";
import { runScrapePipeline, failStaleScrapeRuns } from "@/lib/pipeline/run-scrape";
import type { Settings } from "@/lib/types";

// A scrape now fans out to one Apify run per active board × per keyword (up to
// 25), so it runs much longer than before. `after` keeps it going once the
// response is sent — on a Node server it just runs; on serverless it extends the
// invocation via waitUntil. Platforms cap this; a cutoff degrades gracefully
// (the stale-run reaper fails the row, the user re-runs).
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Belt-and-suspenders: the proxy already rewrites demo traffic to /api/demo.
  if (isDemoRequest(request)) {
    return NextResponse.json({ error: "Not available in demo" }, { status: 403 });
  }

  const supabase = getSupabaseServerClient();

  // Clear out any zombie run (dead worker) so it can't linger as 'running'.
  await failStaleScrapeRuns(supabase);

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

  after(async () => {
    try {
      await runScrapePipeline(runData.id, settings as Settings);
    } catch (err) {
      console.error("Scrape pipeline failed:", err);
    }
  });

  return NextResponse.json({ runId: runData.id });
}
