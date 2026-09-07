import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { failStaleScoreRuns } from "@/lib/pipeline/run-score";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  // Reap dead runs first so a stalled worker surfaces as 'failed' here rather
  // than leaving the client polling 'running' indefinitely.
  const reaped = await failStaleScoreRuns(supabase);

  const { data, error } = await supabase
    .from("score_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stalled = reaped.includes(data.id);

  return NextResponse.json({
    runId: data.id,
    status: data.status,
    total: data.total,
    scored: data.scored,
    stalled,
    completedAt: data.ended_at,
  });
}
