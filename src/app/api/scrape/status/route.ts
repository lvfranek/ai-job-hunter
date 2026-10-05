import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, CURRENT_USER_ID } from "@/lib/supabase";
import { failStaleScrapeRuns } from "@/lib/pipeline/run-scrape";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  const supabase = getSupabaseServerClient();

  // Without a runId: when did the last scrape finish, and is one running right
  // now? Powers "Last scraped" on the dashboard (which would otherwise reset to
  // "Never" on every page load) and lets the UI pick a live run back up after a
  // reload instead of offering to start a second one.
  if (!runId) {
    await failStaleScrapeRuns(supabase);

    const [last, active] = await Promise.all([
      supabase
        .from("scrape_runs")
        .select("ended_at")
        .eq("user_id", CURRENT_USER_ID)
        .eq("status", "completed")
        .order("ended_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("scrape_runs")
        .select("id")
        .eq("user_id", CURRENT_USER_ID)
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const error = last.error ?? active.error;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      completedAt: last.data?.ended_at ?? null,
      activeRunId: active.data?.id ?? null,
    });
  }

  // Reap dead runs first so a stalled worker surfaces as 'failed' here rather
  // than leaving the client polling 'running' indefinitely.
  const reaped = await failStaleScrapeRuns(supabase);

  const { data, error } = await supabase.from("scrape_runs").select("*").eq("id", runId).single();

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
