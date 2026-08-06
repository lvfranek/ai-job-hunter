import { NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";

export async function POST() {
  try {
    const supabase = getSupabaseServerClient();

    const { data: runData, error: runError } = await supabase
      .from("scrape_runs")
      .insert({ user_id: CURRENT_USER_ID, status: "running" })
      .select()
      .single();

    if (runError) throw runError;

    // TODO: Trigger Apify scrapers, wait for results, pre-filter, dedup, store jobs (Phase 2+)

    return NextResponse.json({ runId: runData.id, message: "Scrape initiated" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
