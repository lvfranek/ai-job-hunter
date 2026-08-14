import { NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { runScrapePipeline } from "@/lib/pipeline/run-scrape";
import type { Settings } from "@/lib/types";

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
