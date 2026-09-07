import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { failStaleScrapeRuns } from "@/lib/pipeline/run-scrape";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  // Reap dead runs first so a stalled worker surfaces as 'failed' here rather
  // than leaving the client polling 'running' indefinitely.
  const reaped = await failStaleScrapeRuns(supabase);

  const { data, error } = await supabase
    .from("scrape_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    runId: data.id,
    status: data.status,
    jobsFound: data.total_scraped,
    jobsFiltered: data.passed_prefilter,
    jobsStored: data.scored,
    portalCounts: data.portal_counts ?? {},
    totalRuns: data.total_runs ?? 0,
    completedRuns: data.completed_runs ?? 0,
    stalled: reaped.includes(data.id),
    completedAt: data.ended_at,
  });
}
